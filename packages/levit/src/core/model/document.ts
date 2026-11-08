import { BlockNode, DocumentData, EditorPosition, EditorSelection, InlineMark, InlineNode } from './types.js';

let idCounter = 0;
export function generateBlockId(prefix = 'b'): string {
  idCounter += 1;
  const rand = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}_${idCounter}`;
}

export function createTextNode(text: string, marks: InlineMark[] = []): InlineNode {
  return {
    text,
    marks: marks ? [...marks] : [],
  };
}

export function createBlock(
  type = 'paragraph',
  attrs: Record<string, any> = {},
  content: InlineNode[] = [createTextNode('')],
  id?: string
): BlockNode {
  return {
    id: id || generateBlockId(),
    type,
    attrs: { ...attrs },
    content: content.length > 0 ? content : [createTextNode('')],
  };
}

export function createDocument(blocks?: BlockNode[]): DocumentData {
  return {
    version: 1,
    blocks: blocks && blocks.length > 0 ? blocks : [createBlock()],
  };
}

export function getBlockText(block: BlockNode): string {
  return block.content.reduce((acc, node) => acc + node.text, '');
}

export function findBlockIndex(doc: DocumentData, blockId: string): number {
  return doc.blocks.findIndex((b) => b.id === blockId);
}

export function areMarksEqual(m1?: InlineMark[], m2?: InlineMark[]): boolean {
  const marks1 = m1 || [];
  const marks2 = m2 || [];
  if (marks1.length !== marks2.length) return false;

  for (const mark of marks1) {
    const match = marks2.find((m) => m.type === mark.type);
    if (!match) return false;
    const attrs1 = mark.attrs || {};
    const attrs2 = match.attrs || {};
    const keys1 = Object.keys(attrs1);
    const keys2 = Object.keys(attrs2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
      if (attrs1[key] !== attrs2[key]) return false;
    }
  }
  return true;
}

/**
 * Normalizes inline nodes: combines adjacent nodes with identical marks and removes empty nodes.
 */
export function normalizeInlineNodes(nodes: InlineNode[]): InlineNode[] {
  if (nodes.length === 0) return [createTextNode('')];

  const result: InlineNode[] = [];
  for (const node of nodes) {
    if (!node.text) continue;
    if (result.length > 0) {
      const prev = result[result.length - 1];
      if (areMarksEqual(prev.marks, node.marks)) {
        prev.text += node.text;
        continue;
      }
    }
    result.push({
      text: node.text,
      marks: node.marks ? [...node.marks] : [],
    });
  }

  return result.length === 0 ? [createTextNode('')] : result;
}

/**
 * Splits block inline content at character offset.
 */
export function splitBlockContent(block: BlockNode, offset: number): [InlineNode[], InlineNode[]] {
  const left: InlineNode[] = [];
  const right: InlineNode[] = [];
  let currentOffset = 0;

  for (const node of block.content) {
    const nodeLength = node.text.length;
    const nodeEnd = currentOffset + nodeLength;

    if (offset <= currentOffset) {
      // Entirely in right half
      right.push({ text: node.text, marks: node.marks ? [...node.marks] : [] });
    } else if (offset >= nodeEnd) {
      // Entirely in left half
      left.push({ text: node.text, marks: node.marks ? [...node.marks] : [] });
    } else {
      // Offset falls right inside this inline node
      const splitPoint = offset - currentOffset;
      const leftText = node.text.slice(0, splitPoint);
      const rightText = node.text.slice(splitPoint);

      if (leftText) {
        left.push({ text: leftText, marks: node.marks ? [...node.marks] : [] });
      }
      if (rightText) {
        right.push({ text: rightText, marks: node.marks ? [...node.marks] : [] });
      }
    }

    currentOffset = nodeEnd;
  }

  return [
    normalizeInlineNodes(left),
    normalizeInlineNodes(right),
  ];
}

/**
 * Merges two inline node arrays into a single normalized array.
 */
export function mergeBlockContent(left: InlineNode[], right: InlineNode[]): InlineNode[] {
  return normalizeInlineNodes([...left, ...right]);
}


export const LIST_ITEM_TYPES = ['bullet_list_item', 'ordered_list_item', 'task_list_item'] as const;

export function isListItem(type: string): boolean {
  return (LIST_ITEM_TYPES as readonly string[]).includes(type);
}

/** Blocks without text, like dividers and images. The caret never goes inside them. */
export const ATOM_BLOCK_TYPES = ['horizontal_rule', 'image'] as const;

export function isAtomBlock(type: string): boolean {
  return (ATOM_BLOCK_TYPES as readonly string[]).includes(type);
}

/** Every block type Levit knows without plugins. */
export const BUILT_IN_BLOCK_TYPES: readonly string[] = [
  'paragraph', 'heading', 'blockquote', 'code_block', ...LIST_ITEM_TYPES, ...ATOM_BLOCK_TYPES,
];

/** Deepest nesting level a list item can have. */
export const MAX_LIST_INDENT = 8;

/** How deeply a list item is nested: 0 at the top level. */
export function listIndent(block: BlockNode): number {
  if (!isListItem(block.type)) return 0;
  const n = block.attrs?.indent;
  return Number.isInteger(n) && n > 0 ? Math.min(n, MAX_LIST_INDENT) : 0;
}

/** Sets a list item's nesting level, leaving no attribute at the top level. */
export function setListIndent(block: BlockNode, indent: number): void {
  const attrs = { ...block.attrs };
  if (indent > 0) attrs.indent = Math.min(indent, MAX_LIST_INDENT);
  else delete attrs.indent;
  block.attrs = attrs;
}

/**
 * Returns the inline nodes between two character offsets of a block.
 */
export function sliceBlockContent(block: BlockNode, start: number, end: number): InlineNode[] {
  const [, fromStart] = splitBlockContent(block, start);
  const [middle] = splitBlockContent({ ...block, content: fromStart }, end - start);
  return middle;
}

/** The two ends of a selection in document order. */
export function orderedSelection(doc: DocumentData, selection: EditorSelection): { from: EditorPosition; to: EditorPosition } {
  const { anchor, head } = selection;
  const a = findBlockIndex(doc, anchor.blockId);
  const h = findBlockIndex(doc, head.blockId);
  const forward = a < h || (a === h && anchor.offset <= head.offset);
  return forward ? { from: { ...anchor }, to: { ...head } } : { from: { ...head }, to: { ...anchor } };
}

/**
 * Copies the blocks covered by a selection, cut to the selected text.
 * Returns an empty array for a collapsed selection.
 */
export function sliceDocument(doc: DocumentData, selection: EditorSelection): BlockNode[] {
  if (selection.isCollapsed) return [];
  let { anchor: from, head: to } = selection;
  let fromIdx = findBlockIndex(doc, from.blockId);
  let toIdx = findBlockIndex(doc, to.blockId);
  if (fromIdx === -1 || toIdx === -1) return [];
  if (fromIdx > toIdx || (fromIdx === toIdx && from.offset > to.offset)) {
    [from, to, fromIdx, toIdx] = [to, from, toIdx, fromIdx];
  }

  const out: BlockNode[] = [];
  for (let i = fromIdx; i <= toIdx; i++) {
    const block = doc.blocks[i];
    const start = i === fromIdx ? from.offset : 0;
    const end = i === toIdx ? to.offset : getBlockText(block).length;
    out.push({
      id: block.id,
      type: block.type,
      attrs: { ...block.attrs },
      content: sliceBlockContent(block, start, end),
    });
  }
  return out;
}
