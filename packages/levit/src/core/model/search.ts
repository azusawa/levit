import type { DocumentData, InlineNode } from './types.js';
import type { Transaction } from '../state/transaction.js';
import { findBlockIndex, getBlockText, normalizeInlineNodes, splitBlockContent } from './document.js';

/** Where a piece of found text is: offsets in the text of one block. */
export interface SearchMatch {
  blockId: string;
  from: number;
  to: number;
  /** The text found there, as written in the document. */
  text: string;
}

export interface SearchOptions {
  /** Match upper and lower case exactly. Default: false. */
  caseSensitive?: boolean;
}

/** Lower-case letters that have another lower-case form in some places. */
const SAME_LETTER: Record<string, string> = { ς: 'σ' };

/**
 * Lower case that keeps every character at its place, so offsets in the
 * folded text are offsets in the original ("İ" lowers to two characters
 * and stays as it is).
 */
function foldCase(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const kept = lower.length === ch.length ? lower : ch;
    out += SAME_LETTER[kept] ?? kept;
  }
  return out;
}

/**
 * Every place `query` is in the document, in order. Matches stay inside one
 * block and do not overlap. Blocks without text (images, dividers) have none.
 */
export function findMatches(doc: DocumentData, query: string, options: SearchOptions = {}): SearchMatch[] {
  if (!query) return [];
  const fold = options.caseSensitive ? (t: string) => t : foldCase;
  const needle = fold(query);
  const matches: SearchMatch[] = [];
  for (const block of doc.blocks) {
    const blockText = getBlockText(block);
    const haystack = fold(blockText);
    let at = haystack.indexOf(needle);
    while (at !== -1) {
      const to = at + needle.length;
      matches.push({ blockId: block.id, from: at, to, text: blockText.slice(at, to) });
      at = haystack.indexOf(needle, at + needle.length);
    }
  }
  return matches;
}

/** True when the block still has the found text at the match's place. */
function stillThere(doc: DocumentData, match: SearchMatch): boolean {
  const index = findBlockIndex(doc, match.blockId);
  if (index === -1 || match.from < 0 || match.from >= match.to) return false;
  return getBlockText(doc.blocks[index]).slice(match.from, match.to) === match.text;
}

/**
 * Replaces matches (from findMatches) with `text` in one change, so one undo
 * brings them all back. The new text takes the marks of the first letter it
 * replaces. Matches whose text is no longer at their place (the document
 * changed since findMatches) are skipped. The caret
 * goes after the last replaced text. Returns how many were replaced.
 */
export function replaceMatches(tr: Transaction, matches: readonly SearchMatch[], text: string): number {
  const valid = matches.filter((m) => stillThere(tr.doc, m));
  if (valid.length === 0) return 0;
  // From the end, so earlier offsets in a block stay right.
  const ordered = [...valid].sort((a, b) => {
    const blockOrder = findBlockIndex(tr.doc, b.blockId) - findBlockIndex(tr.doc, a.blockId);
    return blockOrder !== 0 ? blockOrder : b.from - a.from;
  });
  for (const match of ordered) {
    const block = tr.editBlock(match.blockId)!;
    const [left, rest] = splitBlockContent(block, match.from);
    const [middle, right] = splitBlockContent({ ...block, content: rest }, match.to - match.from);
    const replaced: InlineNode[] = text ? [{ text, marks: [...(middle[0]?.marks ?? [])] }] : [];
    block.content = normalizeInlineNodes([...left, ...replaced, ...right]);
  }
  const last = ordered[0];
  const caret = { blockId: last.blockId, offset: last.from + text.length };
  tr.setSelection({ anchor: caret, head: { ...caret }, isCollapsed: true });
  tr.docChanged = true;
  return valid.length;
}
