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

/** Maps a DOM boundary point to an editor position, or null if it is outside the blocks. */
export function domPointToPosition(
  container: HTMLElement,
  node: Node,
  offset: number
): EditorPosition | null {
  if (!container.contains(node)) return null;
  const block = findAncestorBlock(node, container);
  if (!block) return null;
  return { blockId: block.getAttribute('data-block-id')!, offset: getOffsetInBlock(block, node, offset) };
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

  // Read both ends from the Range, and use anchor only to tell the direction.
  // Some DOM implementations (e.g. happy-dom) report a wrong focusNode.
  const range = sel.getRangeAt(0);
  const isBackward =
    !range.collapsed &&
    sel.anchorNode === range.endContainer &&
    sel.anchorOffset === range.endOffset;

  const start = domPointToPosition(container, range.startContainer, range.startOffset);
  const end = domPointToPosition(container, range.endContainer, range.endOffset);
  if (!start || !end) return null;

  return {
    anchor: isBackward ? end : start,
    head: isBackward ? start : end,
    isCollapsed: sel.isCollapsed,
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

export function restoreDOMSelection(container: HTMLElement, sel: EditorSelection): void {
  const domSel = window.getSelection();
  if (!domSel) return;

  const anchorBlock = container.querySelector(`[data-block-id="${sel.anchor.blockId}"]`) as HTMLElement;
  if (!anchorBlock) return;

  const anchorPoint = findDOMPoint(anchorBlock, sel.anchor.offset);
  const range = document.createRange();

  if (sel.isCollapsed) {
    range.setStart(anchorPoint.node, anchorPoint.offset);
    range.collapse(true);
    domSel.removeAllRanges();
    domSel.addRange(range);
    return;
  }

  const headBlock = container.querySelector(`[data-block-id="${sel.head.blockId}"]`) as HTMLElement;
  if (!headBlock) return;

  const headPoint = findDOMPoint(headBlock, sel.head.offset);

  range.setStart(anchorPoint.node, anchorPoint.offset);
  range.setEnd(headPoint.node, headPoint.offset);

  domSel.removeAllRanges();
  domSel.addRange(range);
}
