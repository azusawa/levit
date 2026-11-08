// Offsets are UTF-16 code units, like the rest of the model. These helpers keep
// edits on user-visible character (grapheme) and word boundaries.

type Segment = { index: number; segment: string; isWordLike?: boolean };

const hasSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl;
const graphemes = hasSegmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const words = hasSegmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

function graphemeSegments(text: string): Segment[] {
  if (graphemes) return Array.from(graphemes.segment(text));
  // Fallback: split by code point.
  const out: Segment[] = [];
  let index = 0;
  for (const ch of text) {
    out.push({ index, segment: ch });
    index += ch.length;
  }
  return out;
}

function wordSegments(text: string): Segment[] {
  if (words) return Array.from(words.segment(text));
  const out: Segment[] = [];
  for (const m of text.matchAll(/\s+|[^\s]+/g)) {
    out.push({ index: m.index!, segment: m[0], isWordLike: !/^\s/.test(m[0]) });
  }
  return out;
}

const isSpace = (s: string) => /^\s+$/.test(s);

/** Offset of the start of the character before `offset`. */
export function previousCharOffset(text: string, offset: number): number {
  let prev = 0;
  for (const seg of graphemeSegments(text)) {
    if (seg.index >= offset) break;
    prev = seg.index;
  }
  return Math.min(prev, offset);
}

/** Offset of the end of the character after `offset`. */
export function nextCharOffset(text: string, offset: number): number {
  for (const seg of graphemeSegments(text)) {
    const end = seg.index + seg.segment.length;
    if (end > offset) return end;
  }
  return text.length;
}

/** Start of the word before `offset`, skipping the spaces right before it. */
export function previousWordOffset(text: string, offset: number): number {
  const segs = wordSegments(text).filter((s) => s.index < offset);
  let i = segs.length - 1;
  while (i >= 0 && isSpace(segs[i].segment)) i--;
  return i >= 0 ? segs[i].index : 0;
}

/** End of the word after `offset`, skipping the spaces right after it. */
export function nextWordOffset(text: string, offset: number): number {
  const segs = wordSegments(text).filter((s) => s.index + s.segment.length > offset);
  let i = 0;
  while (i < segs.length && isSpace(segs[i].segment)) i++;
  return i < segs.length ? segs[i].index + segs[i].segment.length : text.length;
}

/** Start of the line (after the last newline) that contains `offset`. */
export function lineStartOffset(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

/** End of the line (before the next newline) that contains `offset`. */
export function lineEndOffset(text: string, offset: number): number {
  const i = text.indexOf('\n', offset);
  return i === -1 ? text.length : i;
}
