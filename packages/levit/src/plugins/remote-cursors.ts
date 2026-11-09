import type { LevitEditor } from '../core/editor.js';
import type { EditorPosition } from '../core/model/types.js';
import { positionToDOMPoint } from '../core/view/selection.js';

/** Another user's caret or selection. */
export interface RemoteCursor {
  /** Stays the same for one user, so their caret is moved, not redrawn. */
  id: string;
  name: string;
  /** A CSS color. Anything that is not a color is replaced by a gray. */
  color: string;
  anchor: EditorPosition;
  head: EditorPosition;
}

export interface RemoteCursorsInstance {
  /** Shows these cursors (and removes others). */
  set(cursors: RemoteCursor[]): void;
  /** Draws again, for example after the page layout changed. */
  update(): void;
  destroy(): void;
}

const FALLBACK_COLOR = '#64748b';

/** Only plain colors: no url(), var() or anything else in a style. */
function safeColor(color: string): string {
  const plain = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([0-9.,%\s/+-]+\)|[a-z]{3,20})$/i.test(color.trim());
  if (!plain) return FALLBACK_COLOR;
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('color', color)) return FALLBACK_COLOR;
  return color.trim();
}

/**
 * Shows where other people are in the document: a colored caret with their
 * name, and their selection. Works with any way of sharing positions (see
 * @yonailab/levit-yjs). The layer sits next to the editor, not inside it,
 * and is hidden from screen readers.
 */
export function createRemoteCursors(editor: LevitEditor): RemoteCursorsInstance {
  const layer = document.createElement('div');
  layer.className = 'levit-remote-cursors';
  layer.setAttribute('aria-hidden', 'true');
  editor.container.after(layer);

  let cursors: RemoteCursor[] = [];
  let frame = 0;

  const rectsOf = (cursor: RemoteCursor): { caret: DOMRect | null; selection: DOMRect[] } | null => {
    const root = editor.container;
    const blockOf = (p: EditorPosition) => root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(p.blockId)}"]`);
    const headBlock = blockOf(cursor.head);
    const anchorBlock = blockOf(cursor.anchor);
    if (!headBlock || !anchorBlock) return null;
    const head = positionToDOMPoint(root, headBlock, cursor.head.offset, false);
    const caretRange = document.createRange();
    caretRange.setStart(head.node, head.offset);
    caretRange.collapse(true);
    const caret = caretRange.getClientRects()[0] ?? caretRange.getBoundingClientRect() ?? null;

    let selection: DOMRect[] = [];
    if (cursor.anchor.blockId !== cursor.head.blockId || cursor.anchor.offset !== cursor.head.offset) {
      const anchor = positionToDOMPoint(root, anchorBlock, cursor.anchor.offset, true);
      const range = document.createRange();
      range.setStart(anchor.node, anchor.offset);
      range.setEnd(head.node, head.offset);
      if (range.collapsed) {
        // The head is before the anchor.
        range.setStart(head.node, head.offset);
        range.setEnd(anchor.node, anchor.offset);
      }
      selection = Array.from(range.getClientRects()).filter((r) => r.width > 0);
    }
    return { caret, selection };
  };

  // Each user keeps their elements, which are moved rather than redrawn.
  const drawn = new Map<string, { caret: HTMLElement; name: HTMLElement; boxes: HTMLElement[] }>();

  const elementsFor = (id: string) => {
    let entry = drawn.get(id);
    if (!entry) {
      const caret = document.createElement('div');
      caret.className = 'levit-remote-caret';
      const name = document.createElement('div');
      name.className = 'levit-remote-name';
      caret.appendChild(name);
      layer.appendChild(caret);
      entry = { caret, name, boxes: [] };
      drawn.set(id, entry);
    }
    return entry;
  };

  const draw = () => {
    frame = 0;
    const origin = layer.getBoundingClientRect();
    const shown = new Set<string>();
    for (const cursor of cursors) {
      const rects = rectsOf(cursor);
      if (!rects || shown.has(cursor.id)) continue;
      shown.add(cursor.id);
      const color = safeColor(cursor.color);
      const entry = elementsFor(cursor.id);

      // One box per line of the selection.
      while (entry.boxes.length > rects.selection.length) entry.boxes.pop()!.remove();
      while (entry.boxes.length < rects.selection.length) {
        const box = document.createElement('div');
        box.className = 'levit-remote-selection';
        layer.insertBefore(box, entry.caret);
        entry.boxes.push(box);
      }
      rects.selection.forEach((r, k) => {
        const box = entry.boxes[k];
        box.style.setProperty('--levit-remote-color', color);
        Object.assign(box.style, { left: `${r.left - origin.left}px`, top: `${r.top - origin.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      });

      entry.caret.style.setProperty('--levit-remote-color', color);
      const r = rects.caret;
      if (r) Object.assign(entry.caret.style, { left: `${r.left - origin.left}px`, top: `${r.top - origin.top}px`, height: `${r.height || 16}px` });
      if (entry.name.textContent !== cursor.name) entry.name.textContent = cursor.name;
    }
    for (const [id, entry] of drawn) {
      if (shown.has(id)) continue;
      entry.caret.remove();
      entry.boxes.forEach((b) => b.remove());
      drawn.delete(id);
    }
  };

  // Drawing reads the layout, so it waits for the next frame; set() draws at once.
  const schedule = () => {
    if (frame || typeof requestAnimationFrame === 'undefined') return;
    frame = requestAnimationFrame(draw);
  };

  const stopUpdate = editor.on('update', schedule);
  window.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, true);

  const destroy = () => {
    if (frame && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(frame);
    stopUpdate();
    stopDestroy();
    window.removeEventListener('resize', schedule);
    document.removeEventListener('scroll', schedule, true);
    layer.remove();
  };
  const stopDestroy = editor.on('destroy', destroy);

  return {
    set(next) {
      cursors = next.slice();
      draw();
    },
    update: draw,
    destroy,
  };
}
