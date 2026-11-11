import { EditorPosition, EditorSelection } from '../model/types.js';

/**
 * Finds the closest ancestor element that has data-block-id inside the editor container.
 */
function findAncestorBlock(node: Node | null, container: HTMLElement): HTMLElement | null {
  let curr = node;
  while (curr && curr !== container) {
    if (curr instanceof HTMLElement && curr.hasAttribute('data-block-id')) {
      return curr;
    }
    curr = curr.parentNode;
  }
  return null;
}

/**
 * Counts the characters in a block before a DOM boundary point.
 * The point may be in a text node or on an element (e.g. a range set on <a>).
 */
function getOffsetInBlock(blockEl: HTMLElement, targetNode: Node, targetOffset: number): number {
  const before = document.createRange();
  before.selectNodeContents(blockEl);
  before.setEnd(targetNode, targetOffset);
  return before.toString().length;
}

/** The end of a block element. */
function blockEnd(block: Element): EditorPosition {
  return { blockId: block.getAttribute('data-block-id')!, offset: getOffsetInBlock(block as HTMLElement, block, block.childNodes.length) };
}

/** The block element itself, or the first or last one inside an element. */
function blockIn(node: Node | undefined, last: boolean): Element | null {
  if (node?.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  if (el.hasAttribute('data-block-id')) return el;
  const all = el.querySelectorAll('[data-block-id]');
  return all[last ? all.length - 1 : 0] ?? null;
}

/**
 * Maps a DOM boundary point to an editor position, or null if it is outside
 * the blocks. A point between blocks goes to the start of the block after it,
 * or, with endOfBefore (the end of a selection), to the end of the block before it.
 */
export function domPointToPosition(
  container: HTMLElement,
  node: Node,
  offset: number,
  endOfBefore = false
): EditorPosition | null {
  if (!container.contains(node)) return null;
  const block = findAncestorBlock(node, container);
  if (block) return { blockId: block.getAttribute('data-block-id')!, offset: getOffsetInBlock(block, node, offset) };
  // A point between blocks (select all when the first or last block is an
  // image), or between table cells.
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const before = endOfBefore ? blockIn(node.childNodes[offset - 1], true) : null;
  if (before) return blockEnd(before);
  const next = blockIn(node.childNodes[offset], false);
  if (next) return { blockId: next.getAttribute('data-block-id')!, offset: 0 };
  const last = blockIn(node, true);
  return last ? blockEnd(last) : null;
}

/** Maps a DOM range (e.g. a beforeinput target range) to an editor selection. */
export function domRangeToEditorSelection(
  container: HTMLElement,
  range: { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number }
): EditorSelection | null {
  const anchor = domPointToPosition(container, range.startContainer, range.startOffset);
  const head = domPointToPosition(container, range.endContainer, range.endOffset);
  if (!anchor || !head) return null;
  return {
    anchor,
    head,
    isCollapsed: anchor.blockId === head.blockId && anchor.offset === head.offset,
  };
}

/** The editor position under a screen point, used for drops. */
export function positionFromPoint(container: HTMLElement, x: number, y: number): EditorPosition | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    return pos ? domPointToPosition(container, pos.offsetNode, pos.offset) : null;
  }
  if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    return range ? domPointToPosition(container, range.startContainer, range.startOffset) : null;
  }
  return null;
}

export function domSelectionToEditorSelection(container: HTMLElement): EditorSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  if (sel.rangeCount > 1) return cellSelection(container, sel);

  // Read both ends from the Range, and use anchor only to tell the direction.
  // Some DOM implementations (e.g. happy-dom) report a wrong focusNode.
  const range = sel.getRangeAt(0);
  const isBackward =
    !range.collapsed &&
    sel.anchorNode === range.endContainer &&
    sel.anchorOffset === range.endOffset;

  const start = domPointToPosition(container, range.startContainer, range.startOffset);
  const end = domPointToPosition(container, range.endContainer, range.endOffset, !range.collapsed);
  if (!start || !end) return null;

  return {
    anchor: isBackward ? end : start,
    head: isBackward ? start : end,
    isCollapsed: sel.isCollapsed,
  };
}

/**
 * Firefox selects table cells dragged across as one range per cell. Cells
 * that follow each other become one selection from the first to the last.
 * Cells with others between them (a column) cannot be one selection without
 * taking those in, so only the cell where the drag started is used.
 */
function cellSelection(container: HTMLElement, sel: Selection): EditorSelection | null {
  const ranges: { range: Range; start: EditorPosition; end: EditorPosition }[] = [];
  for (let i = 0; i < sel.rangeCount; i++) {
    const range = sel.getRangeAt(i);
    const start = domPointToPosition(container, range.startContainer, range.startOffset);
    const end = domPointToPosition(container, range.endContainer, range.endOffset, !range.collapsed);
    if (start && end) ranges.push({ range, start, end });
  }
  if (ranges.length === 0) return null;
  ranges.sort((a, b) => a.range.compareBoundaryPoints(Range.START_TO_START, b.range));

  const order = new Map(
    Array.from(container.querySelectorAll('[data-block-id]'), (el, i) => [el.getAttribute('data-block-id')!, i])
  );
  const index = (p: EditorPosition) => order.get(p.blockId) ?? -1;
  const joined = ranges.every((r, i) => i === 0 || index(r.start) <= index(ranges[i - 1].end) + 1);

  const anchorIn = (r: Range) => !!sel.anchorNode && r.comparePoint(sel.anchorNode, sel.anchorOffset) >= 0;
  const first = ranges[0];
  const last = ranges[ranges.length - 1];
  if (!joined) {
    const own = [...ranges].reverse().find((r) => anchorIn(r.range)) ?? first;
    return { anchor: own.start, head: own.end, isCollapsed: false };
  }
  // The drag went back when it started in the last range.
  const isBackward = ranges.length > 1 && anchorIn(last.range);
  return {
    anchor: isBackward ? last.end : first.start,
    head: isBackward ? first.start : last.end,
    isCollapsed: false,
  };
}

/**
 * Finds the DOM Text node and relative offset corresponding to a character offset in a block.
 */
function findDOMPoint(blockEl: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
  let textNode: Node | null;
  let accumulated = 0;

  while ((textNode = walker.nextNode())) {
    const len = (textNode.nodeValue || '').length;
    if (accumulated + len >= targetOffset) {
      return {
        node: textNode,
        offset: Math.max(0, targetOffset - accumulated),
      };
    }
    accumulated += len;
  }

  // No text (an empty block): put the caret where the text would start,
  // before the placeholder <br> and after a task checkbox.
  const br = Array.from(blockEl.childNodes).findIndex((n) => n.nodeName === 'BR');
  return {
    node: blockEl,
    offset: br === -1 ? 0 : br,
  };
}

/**
 * The DOM point for an editor position. Blocks that cannot be edited (images,
 * dividers) have no point inside them, so the point goes before the block
 * when it starts a selection and after it otherwise.
 */
export function positionToDOMPoint(
  container: HTMLElement,
  blockEl: HTMLElement,
  offset: number,
  isStart: boolean
): { node: Node; offset: number } {
  if (blockEl.getAttribute('contenteditable') === 'false') {
    const index = Array.prototype.indexOf.call(container.childNodes, blockEl);
    return { node: container, offset: isStart ? index : index + 1 };
  }
  return findDOMPoint(blockEl, offset);
}

export function restoreDOMSelection(container: HTMLElement, sel: EditorSelection): void {
  const domSel = window.getSelection();
  if (!domSel) return;

  const anchorBlock = container.querySelector(`[data-block-id="${sel.anchor.blockId}"]`) as HTMLElement;
  if (!anchorBlock) return;

  const range = document.createRange();

  if (sel.isCollapsed) {
    const point = positionToDOMPoint(container, anchorBlock, sel.anchor.offset, false);
    range.setStart(point.node, point.offset);
    range.collapse(true);
    domSel.removeAllRanges();
    domSel.addRange(range);
    return;
  }

  const headBlock = container.querySelector(`[data-block-id="${sel.head.blockId}"]`) as HTMLElement;
  if (!headBlock) return;

  const forward = anchorBlock === headBlock
    ? sel.anchor.offset <= sel.head.offset
    : !!(anchorBlock.compareDocumentPosition(headBlock) & Node.DOCUMENT_POSITION_FOLLOWING);
  const anchorPoint = positionToDOMPoint(container, anchorBlock, sel.anchor.offset, forward);
  const headPoint = positionToDOMPoint(container, headBlock, sel.head.offset, !forward);
  const [start, end] = forward ? [anchorPoint, headPoint] : [headPoint, anchorPoint];

  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  domSel.removeAllRanges();
  domSel.addRange(range);
}
