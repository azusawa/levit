import type { LevitEditor } from '../core/editor.js';
import { caretAt, findBlockIndex, getBlockText, orderedSelection } from '../core/model/document.js';
import { blockUnit } from '../core/model/move.js';
import { isTableCell } from '../core/model/table.js';
import type { BlockNode } from '../core/model/types.js';
import { lineIcon } from './toolbar-icons.js';

export interface BlockHandleInstance {
  /** The handle that shows next to the block under the mouse. */
  element: HTMLElement;
  /** The block menu the handle opens. */
  menu: HTMLElement;
  destroy: () => void;
}

/** Six dots: something to take hold of. */
const GRIP = ['fill:M5 3h2v2H5zM9 3h2v2H9zM5 7h2v2H5zM9 7h2v2H9zM5 11h2v2H5zM9 11h2v2H9z'];

/** How far (px) the pointer goes before a press on the handle becomes a drag. */
const DRAG_DISTANCE = 4;
/** Near the top or bottom of the window (px), a drag scrolls it. */
const SCROLL_EDGE = 40;
const SCROLL_STEP = 12;
/** The space (px) between the handle and its block. */
const GAP = 4;

interface MenuEntry {
  label: string;
  run: () => void;
  /** For the block types: whether the block has this type now. */
  checked?: boolean;
}

const handles = new WeakMap<LevitEditor, BlockHandleInstance>();

/**
 * A handle (⋮⋮) next to the block under the mouse. Dragging it moves the
 * block (a table whole, a list item with its nested items); clicking it
 * opens a menu to turn the block into another type, move it up or down,
 * duplicate or delete it. When the block is part of the selection, the
 * menu acts on all selected blocks. An editor has one: calling this again
 * returns it.
 */
export function createBlockHandle(editor: LevitEditor): BlockHandleInstance {
  const existing = handles.get(editor);
  if (existing) return existing;
  const m = editor.messages;
  const container = editor.container;

  const handle = document.createElement('div');
  handle.className = 'levit-block-handle';
  handle.style.display = 'none';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'levit-block-handle-btn';
  button.title = m.blockHandleTitle;
  button.setAttribute('aria-label', m.blockMenu);
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.appendChild(lineIcon(GRIP, 'levit-block-handle-fill'));
  handle.appendChild(button);

  const menu = document.createElement('div');
  menu.className = 'levit-block-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', m.blockMenu);
  menu.style.display = 'none';

  const indicator = document.createElement('div');
  indicator.className = 'levit-block-drop-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.style.display = 'none';

  /** The block the handle is next to: the first block of a top-level element. */
  let blockId: string | null = null;
  let menuOpen = false;

  // --- Top-level elements --------------------------------------------------

  /** The editor's top-level elements (a block, or a table) with their first block's id. */
  function topElements(): { el: HTMLElement; id: string }[] {
    const out: { el: HTMLElement; id: string }[] = [];
    for (const el of Array.from(container.children) as HTMLElement[]) {
      const id = el.getAttribute('data-block-id') ?? el.querySelector('[data-block-id]')?.getAttribute('data-block-id');
      if (id) out.push({ el, id });
    }
    return out;
  }

  /** The top-level element at a height on the screen, or the closest one. */
  function topElementAt(y: number): { el: HTMLElement; id: string } | null {
    let closest: { el: HTMLElement; id: string } | null = null;
    let distance = Infinity;
    for (const top of topElements()) {
      const rect = top.el.getBoundingClientRect();
      if (y >= rect.top && y < rect.bottom) return top;
      const d = Math.min(Math.abs(y - rect.top), Math.abs(y - rect.bottom));
      if (d < distance) {
        distance = d;
        closest = top;
      }
    }
    return closest;
  }

  const elementOf = (id: string) => topElements().find((top) => top.id === id)?.el ?? null;

  // --- The handle ----------------------------------------------------------

  function hideHandle() {
    if (menuOpen || drag) return;
    handle.style.display = 'none';
    blockId = null;
  }

  function showHandle(top: { el: HTMLElement; id: string }) {
    blockId = top.id;
    handle.style.display = 'flex';
    const rect = top.el.getBoundingClientRect();
    const width = handle.getBoundingClientRect().width;
    handle.style.top = `${rect.top + window.scrollY}px`;
    handle.style.left = `${Math.max(GAP, rect.left - width - GAP) + window.scrollX}px`;
  }

  function onMouseMove(e: MouseEvent) {
    if (menuOpen || drag) return;
    if (!editor.isEditable) return hideHandle();
    const top = topElementAt(e.clientY);
    if (top) showHandle(top);
    else hideHandle();
  }

  const isOurs = (node: unknown) => node instanceof Node && (container.contains(node) || handle.contains(node));
  const onMouseLeave = (e: MouseEvent) => {
    if (!isOurs(e.relatedTarget)) hideHandle();
  };
  // Typing hides the handle, as it hides the mouse.
  const onKeyDown = () => hideHandle();

  // --- Acting on the block -------------------------------------------------

  /**
   * Puts the caret at the end of the handle's block, unless the block is
   * part of the selection, so commands act on the selection or on that block.
   */
  function selectBlock(id: string): BlockNode | null {
    const { doc, selection } = editor.state;
    const index = findBlockIndex(doc, id);
    if (index === -1) return null;
    const { from, to } = orderedSelection(doc, selection);
    const start = findBlockIndex(doc, from.blockId);
    const end = findBlockIndex(doc, to.blockId);
    if (index < start || index > end) editor.dispatch(editor.state.tr.setSelection(caretAt(id, getBlockText(doc.blocks[index]).length)));
    return doc.blocks[index];
  }

  function typeEntries(block: BlockNode): MenuEntry[] {
    if (editor.state.schema.isAtom(block.type) || isTableCell(block.type)) return [];
    const level = block.type === 'heading' ? block.attrs?.level : null;
    const types: [string, string, Record<string, unknown>?][] = [
      [m.paragraph, 'paragraph'],
      [m.heading1, 'heading', { level: 1 }],
      [m.heading2, 'heading', { level: 2 }],
      [m.heading3, 'heading', { level: 3 }],
      [m.bulletList, 'bullet_list_item'],
      [m.orderedList, 'ordered_list_item'],
      [m.taskList, 'task_list_item', { checked: false }],
      [m.quote, 'blockquote'],
      [m.codeBlock, 'code_block'],
    ];
    return types.map(([label, type, attrs]) => ({
      label,
      checked: block.type === type && (type !== 'heading' || level === attrs?.level),
      run: () => editor.chain().setBlockType(type, attrs).run(),
    }));
  }

  function blockEntries(): MenuEntry[] {
    return [
      { label: m.moveUp, run: () => editor.chain().moveBlocksUp().run() },
      { label: m.moveDown, run: () => editor.chain().moveBlocksDown().run() },
      { label: m.duplicate, run: () => editor.chain().duplicateBlock().run() },
      { label: m.deleteBlock, run: () => editor.chain().deleteBlock().run() },
    ];
  }

  // --- The menu ------------------------------------------------------------

  let menuItems: HTMLElement[] = [];

  function menuItem(entry: MenuEntry, id: string): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'levit-block-menu-item';
    el.tabIndex = -1;
    el.textContent = entry.label;
    if (entry.checked === undefined) el.setAttribute('role', 'menuitem');
    else {
      el.setAttribute('role', 'menuitemradio');
      el.setAttribute('aria-checked', String(entry.checked));
    }
    // The mouse acts on click; mousedown would take focus to the button first.
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', () => {
      closeMenu();
      if (editor.isEditable && selectBlock(id)) entry.run();
    });
    return el;
  }

  function openMenu() {
    const id = blockId;
    const block = id ? editor.state.doc.blocks[findBlockIndex(editor.state.doc, id)] : null;
    if (!id || !block || !editor.isEditable) return;
    menu.replaceChildren();
    const types = typeEntries(block);
    if (types.length > 0) {
      const heading = document.createElement('div');
      heading.className = 'levit-block-menu-heading';
      heading.setAttribute('role', 'presentation');
      heading.textContent = m.turnInto;
      const group = document.createElement('div');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', m.turnInto);
      group.append(...types.map((entry) => menuItem(entry, id)));
      const line = document.createElement('div');
      line.className = 'levit-block-menu-separator';
      line.setAttribute('role', 'separator');
      menu.append(heading, group, line);
    }
    menu.append(...blockEntries().map((entry) => menuItem(entry, id)));
    menuItems = Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]'));

    menuOpen = true;
    button.setAttribute('aria-expanded', 'true');
    menu.style.display = 'block';
    const rect = button.getBoundingClientRect();
    const height = menu.getBoundingClientRect().height;
    const below = rect.bottom + GAP;
    const top = below + height > window.innerHeight && rect.top - height - GAP >= 0 ? rect.top - height - GAP : below;
    menu.style.top = `${top + window.scrollY}px`;
    menu.style.left = `${rect.left + window.scrollX}px`;
    focusItem(0);
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    button.setAttribute('aria-expanded', 'false');
    menu.style.display = 'none';
    menuItems = [];
    // Back to the text: a removed or moved block takes the handle along.
    handle.style.display = 'none';
    blockId = null;
    if (menu.contains(document.activeElement) || document.activeElement === button) editor.focus();
  }

  function focusItem(index: number) {
    if (menuItems.length === 0) return;
    const i = (index + menuItems.length) % menuItems.length;
    menuItems.forEach((el, j) => (el.tabIndex = j === i ? 0 : -1));
    menuItems[i].focus();
  }

  menu.addEventListener('keydown', (e) => {
    const current = menuItems.indexOf(document.activeElement as HTMLElement);
    const moves: Record<string, number> = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: menuItems.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      focusItem(moves[e.key]);
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      closeMenu();
    }
  });

  const onDocumentMouseDown = (e: MouseEvent) => {
    if (menuOpen && !menu.contains(e.target as Node) && !handle.contains(e.target as Node)) closeMenu();
  };

  // A click from the keyboard (Enter or Space) opens the menu; the mouse
  // opens it on pointerup, unless the press became a drag.
  button.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    if (menuOpen) closeMenu();
    else openMenu();
  });

  // --- Dragging --------------------------------------------------------------

  let drag: { id: string; x: number; y: number; moving: boolean } | null = null;

  /** The elements of the dragged block, with the list items nested under it. */
  function draggedElements(id: string): HTMLElement[] {
    const blocks = editor.state.doc.blocks;
    const unit = blockUnit(blocks, findBlockIndex(editor.state.doc, id));
    if (!unit) return [];
    const inUnit = new Set(blocks.slice(unit[0], unit[1] + 1).map((b) => b.id));
    return topElements()
      .filter((top) => inUnit.has(top.id))
      .map((top) => top.el);
  }

  /** The place (an index between blocks) at a height, and the height of the line that shows it. */
  function dropPlace(y: number): { place: number; line: number } | null {
    const tops = topElements();
    if (tops.length === 0) return null;
    const doc = editor.state.doc;
    for (const top of tops) {
      const rect = top.el.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) return { place: findBlockIndex(doc, top.id), line: rect.top };
    }
    return { place: doc.blocks.length, line: tops[tops.length - 1].el.getBoundingClientRect().bottom };
  }

  function showIndicator(line: number) {
    const rect = container.getBoundingClientRect();
    indicator.style.display = 'block';
    indicator.style.top = `${line + window.scrollY}px`;
    indicator.style.left = `${rect.left + window.scrollX}px`;
    indicator.style.width = `${rect.width}px`;
  }

  function endDrag() {
    if (!drag) return;
    for (const el of Array.from(container.querySelectorAll('.is-dragging'))) el.classList.remove('is-dragging');
    indicator.style.display = 'none';
    handle.classList.remove('is-dragging');
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('keydown', onDragKeyDown, true);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    if (!drag.moving) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_DISTANCE) return;
      drag.moving = true;
      handle.classList.add('is-dragging');
      for (const el of draggedElements(drag.id)) el.classList.add('is-dragging');
    }
    e.preventDefault();
    if (e.clientY < SCROLL_EDGE) window.scrollBy(0, -SCROLL_STEP);
    else if (e.clientY > window.innerHeight - SCROLL_EDGE) window.scrollBy(0, SCROLL_STEP);
    const drop = dropPlace(e.clientY);
    if (drop) showIndicator(drop.line);
  }

  function onPointerUp(e: PointerEvent) {
    const done = drag;
    if (!done) return;
    // Where the pointer is let go: a browser may not send the last move.
    const place = done.moving ? (dropPlace(e.clientY)?.place ?? null) : null;
    endDrag();
    if (!done.moving) {
      openMenu();
      return;
    }
    if (place !== null && editor.isEditable) editor.chain().moveBlock(done.id, place).run();
    hideHandle();
  }

  const onPointerCancel = () => endDrag();
  const onDragKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    endDrag();
  };

  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !blockId || !editor.isEditable) return;
    // Keeps the editor's selection and focus, and stops text selection.
    e.preventDefault();
    if (menuOpen) {
      closeMenu();
      return;
    }
    drag = { id: blockId, x: e.clientX, y: e.clientY, moving: false };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('keydown', onDragKeyDown, true);
  });

  // --- Following the editor --------------------------------------------------

  function follow() {
    if (!blockId || drag) return;
    const el = editor.isEditable ? elementOf(blockId) : null;
    if (!el) {
      closeMenu();
      hideHandle();
      return;
    }
    if (!menuOpen) showHandle({ el, id: blockId });
  }

  container.addEventListener('mousemove', onMouseMove);
  container.addEventListener('mouseleave', onMouseLeave);
  container.addEventListener('keydown', onKeyDown);
  handle.addEventListener('mouseleave', onMouseLeave);
  document.addEventListener('mousedown', onDocumentMouseDown, true);
  const onScroll = () => {
    if (!menuOpen) hideHandle();
  };
  document.addEventListener('scroll', onScroll, true);
  const stops = [editor.on('update', () => follow())];

  document.body.append(handle, menu, indicator);

  const instance: BlockHandleInstance = {
    element: handle,
    menu,
    destroy: () => {
      if (handles.get(editor) !== instance) return;
      handles.delete(editor);
      endDrag();
      stops.forEach((stop) => stop());
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onDocumentMouseDown, true);
      document.removeEventListener('scroll', onScroll, true);
      handle.remove();
      menu.remove();
      indicator.remove();
    },
  };
  stops.push(editor.on('destroy', () => instance.destroy()));
  handles.set(editor, instance);
  return instance;
}
