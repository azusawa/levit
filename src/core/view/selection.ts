import { EditorSelection } from '../model/types.js';

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

  const anchorNode = isBackward ? range.endContainer : range.startContainer;
  const anchorOffset = isBackward ? range.endOffset : range.startOffset;
  const focusNode = isBackward ? range.startContainer : range.endContainer;
  const focusOffset = isBackward ? range.startOffset : range.endOffset;

  if (!anchorNode || !focusNode) return null;
  if (!container.contains(anchorNode) || !container.contains(focusNode)) return null;

  const anchorBlock = findAncestorBlock(anchorNode, container);
  const focusBlock = findAncestorBlock(focusNode, container);

  if (!anchorBlock || !focusBlock) return null;

  const anchorBlockId = anchorBlock.getAttribute('data-block-id')!;
  const focusBlockId = focusBlock.getAttribute('data-block-id')!;

  const anchorCharOffset = getOffsetInBlock(anchorBlock, anchorNode, anchorOffset);
  const focusCharOffset = getOffsetInBlock(focusBlock, focusNode, focusOffset);

  return {
    anchor: { blockId: anchorBlockId, offset: anchorCharOffset },
    head: { blockId: focusBlockId, offset: focusCharOffset },
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

  // If no text node (e.g. empty block with <br>) or targetOffset beyond end
  return {
    node: blockEl,
    offset: 0,
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
