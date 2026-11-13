import { LevitEditor } from '../core/editor.js';
import { tableAt } from '../core/model/table.js';
import { rovingToolbar } from './toolbar-keys.js';

export interface TableToolbarInstance {
  element: HTMLElement;
  destroy: () => void;
}

const SVG = 'http://www.w3.org/2000/svg';

// 16×16 line icons: a row or column with a plus or a cross, a table with a
// filled top row, and a bin. Paths starting with "fill:" are filled.
const ICONS: Record<string, string[]> = {
  addRowAbove: ['M2 8h12v6H2z', 'M8 1v5M5.5 3.5h5'],
  addRowBelow: ['M2 2h12v6H2z', 'M8 10v5M5.5 12.5h5'],
  addColumnLeft: ['M8 2h6v12H8z', 'M1 8h5M3.5 5.5v5'],
  addColumnRight: ['M2 2h6v12H2z', 'M10 8h5M12.5 5.5v5'],
  deleteRow: ['M1 5h9v6H1z', 'M12 6.5l3 3M15 6.5l-3 3'],
  deleteColumn: ['M5 1h6v9H5z', 'M6.5 12l3 3M9.5 12l-3 3'],
  headerRow: ['M2 2h12v12H2z', 'M2 6h12M2 10h12M8 6v8', 'fill:M2 2h12v4H2z'],
  deleteTable: ['M2.5 4h11M6 4V2.5h4V4', 'M4 4l.8 9.5h6.4L12 4'],
};

function icon(name: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG, 'path');
    const filled = d.startsWith('fill:');
    path.setAttribute('d', filled ? d.slice(5) : d);
    if (filled) path.setAttribute('class', 'levit-table-toolbar-fill');
    svg.appendChild(path);
  }
  return svg;
}

/** Modifier keys of a shortcut, as ARIA names them; the key comes last. */
type Shortcut = ('Mod' | 'Alt' | 'Shift' | 'Enter' | 'Backspace')[];

const MAC_SYMBOLS: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧', Enter: '↩', Backspace: '⌫' };
const PC_NAMES: Record<string, string> = { Mod: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Enter: 'Enter', Backspace: 'Backspace' };

/** The shortcut as shown in a tooltip ("Ctrl+Alt+Enter", or "⌥⌘↩" on a Mac) and as aria-keyshortcuts. */
function describeShortcut(keys: Shortcut, mac: boolean): { text: string; aria: string } {
  const aria = keys.map((k) => (k === 'Mod' ? (mac ? 'Meta' : 'Control') : k)).join('+');
  if (!mac) return { text: keys.map((k) => PC_NAMES[k]).join('+'), aria };
  // Mac order: Option, Shift, Command, then the key.
  const order = ['Alt', 'Shift', 'Mod'];
  const sorted = [...keys].sort((a, b) => (order.indexOf(a) + 1 || 9) - (order.indexOf(b) + 1 || 9));
  return { text: sorted.map((k) => MAC_SYMBOLS[k]).join(''), aria };
}

const toolbars = new WeakMap<LevitEditor, TableToolbarInstance>();

/**
 * A toolbar above the table the caret is in, with buttons to add and delete
 * rows and columns, switch the header row and delete the table. An editor has
 * one: calling this again returns it.
 */
export function createTableToolbar(editor: LevitEditor): TableToolbarInstance {
  const existing = toolbars.get(editor);
  if (existing) return existing;
  const m = editor.messages;
  const menu = document.createElement('div');
  menu.className = 'levit-table-toolbar';
  menu.setAttribute('role', 'toolbar');
  menu.setAttribute('aria-label', m.tableToolbar);
  menu.style.display = 'none';

  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
  // The shortcuts are handled in the editor (view/controller.ts).
  const buttons: { icon: string; title: string; action: () => void; group?: true; keys?: Shortcut }[] = [
    { icon: 'addRowAbove', title: m.addRowAbove, action: () => editor.chain().addRowBefore().run() },
    { icon: 'addRowBelow', title: m.addRowBelow, action: () => editor.chain().addRowAfter().run(), keys: ['Mod', 'Enter'] },
    { icon: 'addColumnLeft', title: m.addColumnLeft, action: () => editor.chain().addColumnBefore().run() },
    { icon: 'addColumnRight', title: m.addColumnRight, action: () => editor.chain().addColumnAfter().run(), keys: ['Mod', 'Alt', 'Enter'] },
    { icon: 'deleteRow', title: m.deleteRow, action: () => editor.chain().deleteRow().run(), group: true, keys: ['Mod', 'Shift', 'Backspace'] },
    { icon: 'deleteColumn', title: m.deleteColumn, action: () => editor.chain().deleteColumn().run(), keys: ['Mod', 'Alt', 'Backspace'] },
    { icon: 'headerRow', title: m.headerRow, action: () => editor.chain().toggleHeaderRow().run(), group: true },
    { icon: 'deleteTable', title: m.deleteTable, action: () => editor.chain().deleteTable().run(), group: true },
  ];

  const buttonEls = buttons.map((b) => {
    if (b.group) {
      const line = document.createElement('span');
      line.className = 'levit-table-toolbar-separator';
      line.setAttribute('aria-hidden', 'true');
      menu.appendChild(line);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'levit-table-toolbar-btn';
    btn.setAttribute('aria-label', b.title);
    btn.title = b.title;
    if (b.keys) {
      const shortcut = describeShortcut(b.keys, mac);
      btn.title = `${b.title} (${shortcut.text})`;
      btn.setAttribute('aria-keyshortcuts', shortcut.aria);
    }
    btn.appendChild(icon(b.icon));
    // The mouse acts on mousedown so the editor keeps its selection.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      b.action();
      update();
    });
    // Enter or Space on a focused button sends a click without a mouse.
    btn.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      b.action();
      update();
    });
    menu.appendChild(btn);
    return btn;
  });
  const headerButton = buttonEls[buttons.findIndex((b) => b.icon === 'headerRow')];

  const focusButton = rovingToolbar(menu, buttonEls, () => editor.focus());

  // Alt+F10 (as in Google Docs and Word) moves focus from the table to the
  // toolbar. With text selected, it goes to the formatting toolbar instead.
  function handleEditorKeyDown(e: KeyboardEvent) {
    if (e.key !== 'F10' || !e.altKey || !editor.state.selection.isCollapsed || !editor.isInTable()) return;
    e.preventDefault();
    update(true);
    focusButton(0);
  }
  editor.container.addEventListener('keydown', handleEditorKeyDown);

  const inside = (node: unknown) => node instanceof Node && (editor.container.contains(node) || menu.contains(node));

  /**
   * Shows the toolbar above the caret's table (below it when there is no room
   * above) while the editor or the toolbar has focus, the caret is collapsed
   * and the editor can be edited.
   */
  function update(focused = inside(document.activeElement)) {
    const { selection } = editor.state;
    const id = selection.head.blockId;
    const table = focused && selection.isCollapsed && editor.isEditable ? tableAt(editor.state.doc, id) : null;
    const wrapper = table && editor.container.querySelector(`[data-block-id="${CSS.escape(id)}"]`)?.closest('.levit-table');
    if (!table || !wrapper) {
      // A keyboard user on a button that goes away goes back to the text.
      const hadFocus = focused && menu.contains(document.activeElement);
      menu.style.display = 'none';
      if (hadFocus) editor.focus();
      return;
    }
    const first = editor.state.doc.blocks[table.rows[0][0]];
    headerButton.setAttribute('aria-pressed', String(first.attrs?.header === true));
    menu.style.display = 'flex';
    const rect = wrapper.getBoundingClientRect();
    const height = menu.getBoundingClientRect().height;
    // Above the table, in the room theme.css keeps there. With the table's top
    // scrolled out of view, at the top of the window over the table, and below
    // it once the table is almost gone.
    const above = rect.top - height - 6;
    const top = above >= 10 ? above : rect.bottom - height >= 10 ? 10 : rect.bottom + 6;
    menu.style.top = `${top + window.scrollY}px`;
    menu.style.left = `${Math.max(10, rect.left) + window.scrollX}px`;
  }

  const onFocusOut = (e: FocusEvent) => update(inside(e.relatedTarget));
  menu.addEventListener('focusout', onFocusOut);
  const stops = [
    editor.on('selectionUpdate', () => update()),
    editor.on('update', () => update()),
    editor.on('focus', () => update()),
    editor.on('blur', ({ event }) => update(inside(event.relatedTarget))),
  ];
  // Scrolling anywhere (the page or a box around the editor) moves the table.
  const onMove = () => {
    if (menu.style.display !== 'none') update();
  };
  window.addEventListener('resize', onMove);
  document.addEventListener('scroll', onMove, true);

  document.body.appendChild(menu);
  // Tables keep room above them for the toolbar (theme.css), so it covers no text.
  const addedClass = !editor.container.classList.contains('levit-has-table-toolbar');
  editor.container.classList.add('levit-has-table-toolbar');

  const instance: TableToolbarInstance = {
    element: menu,
    destroy: () => {
      if (toolbars.get(editor) !== instance) return;
      toolbars.delete(editor);
      stops.forEach((stop) => stop());
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
      editor.container.removeEventListener('keydown', handleEditorKeyDown);
      if (addedClass) editor.container.classList.remove('levit-has-table-toolbar');
      menu.remove();
    },
  };
  stops.push(editor.on('destroy', () => instance.destroy()));
  toolbars.set(editor, instance);
  return instance;
}
