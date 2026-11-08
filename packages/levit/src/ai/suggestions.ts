import type { BlockNode, EditorPosition, InlineMark, InlineNode } from '../core/model/types.js';
import type { Transaction } from '../core/state/transaction.js';
import type { MarkSpec } from '../core/plugin/plugin.js';
import {
  createBlock,
  findBlockIndex,
  getBlockText,
  mergeBlockContent,
  normalizeInlineNodes,
  sliceDocument,
  splitBlockContent,
} from '../core/model/document.js';

export const SUGGEST_INSERT = 'suggestion_insert';
export const SUGGEST_DELETE = 'suggestion_delete';

const dataAttribute = (mark: InlineMark) => ({ 'data-suggestion': String(mark.attrs?.id ?? '') });

/**
 * Marks for proposed changes. Added text is <ins>, removed text <del>; both
 * carry the id of the proposal. Markdown reads as if the change were
 * accepted. Typing next to them does not extend them.
 */
export const suggestionMarks: MarkSpec[] = [
  {
    type: SUGGEST_INSERT,
    tag: 'ins',
    className: 'levit-suggestion-insert',
    inclusive: false,
    attributes: dataAttribute,
    toHTML: (text) => `<ins>${text}</ins>`,
    toMarkdown: (text) => text,
    attrsSchema: { type: 'object', properties: { id: { type: 'string' }, join: { type: 'boolean' } } },
  },
  {
    type: SUGGEST_DELETE,
    tag: 'del',
    className: 'levit-suggestion-delete',
    inclusive: false,
    attributes: dataAttribute,
    toHTML: (text) => `<del>${text}</del>`,
    toMarkdown: () => '',
    attrsSchema: { type: 'object', properties: { id: { type: 'string' }, join: { type: 'boolean' } } },
  },
];

const isSuggestion = (mark: InlineMark, id?: string) =>
  (mark.type === SUGGEST_INSERT || mark.type === SUGGEST_DELETE) && (id === undefined || mark.attrs?.id === id);

/** True when the document has proposed changes (with this id, or any). */
export function hasSuggestions(blocks: BlockNode[], id?: string): boolean {
  return blocks.some((b) => b.content.some((n) => n.text && n.marks?.some((m) => isSuggestion(m, id))));
}

const withMark = (nodes: InlineNode[], mark: InlineMark): InlineNode[] =>
  nodes.map((n) => ({ text: n.text, marks: [...(n.marks ?? []).filter((m) => m.type !== mark.type), mark] }));

/** The two ends of a selection in document order. */
function ordered(tr: Transaction): { from: EditorPosition; to: EditorPosition } {
  const { anchor, head } = tr.selection;
  const a = findBlockIndex(tr.doc, anchor.blockId);
  const h = findBlockIndex(tr.doc, head.blockId);
  const forward = a < h || (a === h && anchor.offset <= head.offset);
  return forward ? { from: { ...anchor }, to: { ...head } } : { from: { ...head }, to: { ...anchor } };
}

/** Calls `change` with the part of each block between `from` and `to`, and puts the result back. */
function eachRangePart(tr: Transaction, from: EditorPosition, to: EditorPosition, change: (part: InlineNode[], k: number) => InlineNode[]): void {
  const fromIdx = findBlockIndex(tr.doc, from.blockId);
  const toIdx = findBlockIndex(tr.doc, to.blockId);
  for (let i = fromIdx; i <= toIdx; i++) {
    const block = tr.doc.blocks[i];
    const start = i === fromIdx ? from.offset : 0;
    const end = i === toIdx ? to.offset : getBlockText(block).length;
    const [left, rest] = splitBlockContent(block, start);
    const [part, right] = splitBlockContent({ ...block, content: rest }, end - start);
    block.content = normalizeInlineNodes([...left, ...change(part.filter((n) => n.text), i - fromIdx), ...right]);
  }
  tr.docChanged = true;
}

/**
 * Marks the first run of a block with `join`: when that run is removed (by
 * accepting a deletion or rejecting an insertion), the rest of the block joins
 * the block before. That is how block breaks the proposal removed or added
 * are undone or made real.
 */
function markJoin(block: BlockNode, type: string): void {
  const first = block.content.find((n) => n.text);
  if (!first) return;
  first.marks = (first.marks ?? []).map((m) => (m.type === type ? { ...m, attrs: { ...m.attrs, join: true } } : m));
}

/**
 * Proposes replacing the selection with `blocks`: the selected text is marked
 * as deleted and the new text, marked as inserted, follows it. With `fine`,
 * when the answer has the same blocks as the selection, only the words that
 * changed are marked instead.
 */
export function proposeReplacement(tr: Transaction, blocks: BlockNode[], id: string, fine: boolean): void {
  const del: InlineMark = { type: SUGGEST_DELETE, attrs: { id } };
  const ins: InlineMark = { type: SUGGEST_INSERT, attrs: { id } };
  const { from, to } = ordered(tr);
  // Blocks without text (images) cannot be marked, so they are left out.
  const answer = blocks.filter((b) => !tr.isAtom(b.type));
  if (answer.length === 0) return;

  if (fine && proposeWordChanges(tr, from, to, answer, del, ins)) return;

  if (!tr.selection.isCollapsed) {
    eachRangePart(tr, from, to, (part) => withMark(part, del));
    // The breaks between the selected blocks go away when the deletion is accepted.
    const fromIdx = findBlockIndex(tr.doc, from.blockId);
    const toIdx = findBlockIndex(tr.doc, to.blockId);
    for (let i = fromIdx + 1; i <= toIdx; i++) markJoin(tr.doc.blocks[i], SUGGEST_DELETE);
  }
  tr.setSelection({ anchor: to, head: to, isCollapsed: true });
  // Each block of the answer after the first adds a break, which goes away
  // when the insertion is rejected.
  const inserted = answer.map((b) => ({ ...b, content: withMark(b.content, ins) }));
  inserted.slice(1).forEach((b) => markJoin(b, SUGGEST_INSERT));
  tr.insertFragment(inserted, { keepIds: true });
}

/** Word changes block by block, when the answer has the same blocks. Returns false otherwise. */
function proposeWordChanges(
  tr: Transaction,
  from: EditorPosition,
  to: EditorPosition,
  answer: BlockNode[],
  del: InlineMark,
  ins: InlineMark
): boolean {
  const old = sliceDocument(tr.doc, { anchor: from, head: to, isCollapsed: false });
  const sameShape =
    old.length === answer.length &&
    old.every((b, k) => b.type === answer[k].type && JSON.stringify(b.attrs ?? {}) === JSON.stringify(answer[k].attrs ?? {}));
  if (!sameShape) return false;
  eachRangePart(tr, from, to, (part, k) => diffNodes(part, answer[k].content, del, ins));
  const last = tr.doc.blocks[findBlockIndex(tr.doc, to.blockId)];
  const end = { blockId: last.id, offset: getBlockText(last).length };
  tr.setSelection({ anchor: end, head: end, isCollapsed: true });
  return true;
}

type Token = { text: string; marks: InlineMark[]; key: string };

/** Words, runs of spaces and single other characters, each with its marks. */
function tokens(nodes: InlineNode[]): Token[] {
  const out: Token[] = [];
  for (const node of nodes) {
    const marks = (node.marks ?? []).filter((m) => !isSuggestion(m));
    const markKey = JSON.stringify(marks.map((m) => [m.type, m.attrs ?? null]).sort());
    for (const match of node.text.matchAll(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu)) {
      out.push({ text: match[0], marks, key: `${match[0]}\u0000${markKey}` });
    }
  }
  return out;
}

/** Above this many table cells, a block is shown as all removed and all added. */
const MAX_DIFF_CELLS = 2_000_000;

/**
 * The text of `next` with the differences from `old` marked: removed words
 * with `del`, added words with `ins`, removals first.
 */
function diffNodes(old: InlineNode[], next: InlineNode[], del: InlineMark, ins: InlineMark): InlineNode[] {
  const a = tokens(old);
  const b = tokens(next);
  const n = a.length;
  const m = b.length;
  const asNode = (t: Token, mark?: InlineMark): InlineNode => ({ text: t.text, marks: mark ? [...t.marks, mark] : t.marks });
  if ((n + 1) * (m + 1) > MAX_DIFF_CELLS) return [...a.map((t) => asNode(t, del)), ...b.map((t) => asNode(t, ins))];

  // lcs[i * (m + 1) + j]: length of the longest common run of a[i..] and b[j..].
  const width = m + 1;
  const lcs = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * width + j] = a[i].key === b[j].key ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }
  const out: InlineNode[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i].key === b[j].key) {
      out.push(asNode(b[j]));
      i++;
      j++;
    } else if (j >= m || (i < n && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) {
      out.push(asNode(a[i++], del));
    } else {
      out.push(asNode(b[j++], ins));
    }
  }
  return out;
}

/**
 * Accepts or rejects proposed changes (one proposal by id, or all). Accepting
 * removes the deleted text and keeps the added text; rejecting does the
 * opposite. Blocks the proposal split or joined are put back together.
 * Returns false when there was nothing to resolve.
 */
export function resolveSuggestions(tr: Transaction, accept: boolean, id?: string): boolean {
  const removed = accept ? SUGGEST_DELETE : SUGGEST_INSERT;
  const marks = (n: InlineNode) => n.marks ?? [];
  const isRemoved = (n: InlineNode) => marks(n).some((m) => m.type === removed && isSuggestion(m, id));
  const hasId = (n: InlineNode | undefined) => !!n && marks(n).some((m) => isSuggestion(m, id));

  if (!hasSuggestions(tr.doc.blocks, id)) return false;
  const result: BlockNode[] = [];
  let caretBlock: BlockNode | null = null;

  for (const block of tr.doc.blocks) {
    const nodes = block.content.filter((n) => n.text);
    if (!nodes.some((n) => hasId(n))) {
      result.push(block);
      continue;
    }
    // A removed first run marked `join` means this block's break goes away.
    const joins = isRemoved(nodes[0]) && marks(nodes[0]).some((m) => m.type === removed && m.attrs?.join === true);
    const kept = nodes
      .filter((n) => !isRemoved(n))
      .map((n) => ({ text: n.text, marks: marks(n).filter((m) => !isSuggestion(m, id)) }));

    if (kept.length === 0) {
      // Only removed text: the whole block goes.
    } else if (joins && result.length > 0) {
      const previous = result[result.length - 1];
      previous.content = mergeBlockContent(previous.content, kept);
      caretBlock = previous;
    } else {
      block.content = normalizeInlineNodes(kept);
      result.push(block);
      caretBlock = block;
    }
  }

  if (result.length === 0) result.push(createBlock('paragraph'));
  tr.doc.blocks = result;
  const target = caretBlock && result.includes(caretBlock) ? caretBlock : result[0];
  const end = { blockId: target.id, offset: getBlockText(target).length };
  tr.setSelection({ anchor: end, head: end, isCollapsed: true });
  tr.docChanged = true;
  return true;
}
