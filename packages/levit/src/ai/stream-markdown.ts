import type { LevitEditor } from '../core/editor.js';
import type { BlockNode } from '../core/model/types.js';
import type { Transaction } from '../core/state/transaction.js';
import type { EditorState } from '../core/state/state.js';
import { findBlockIndex, generateBlockId, getBlockText, orderedSelection } from '../core/model/document.js';
import { markdownToDocument } from '../serializers/markdown.js';

export interface StreamMarkdownOptions {
  /** Stops the stream; what arrived so far is kept. */
  signal?: AbortSignal;
  /**
   * Where the answer goes: 'selection' (default) replaces the selection or
   * writes at the caret; 'below' starts a new block after the selected blocks.
   */
  at?: 'selection' | 'below';
  /**
   * Puts the answer into a transaction made from the state before the
   * stream, instead of inserting it at the selection. `final` is true for the
   * last update. Used by the AI plugin to show answers as suggestions.
   */
  insert?: (tr: Transaction, blocks: BlockNode[], final: boolean) => void;
  /** The state to build on. Default: the editor's state when the stream starts. */
  base?: EditorState;
  /** Draw at most once per this many milliseconds (the final text always). Default 30. */
  minInterval?: number;
  /** Lock editing while streaming. Default true. */
  lock?: boolean;
}

/**
 * Streams Markdown (an AI answer) into the editor at the caret, replacing
 * the selection. Headings, lists, bold and the rest appear formatted while
 * the text arrives; formatting that is not closed yet (like "**bo") is shown
 * as if it were. Editing is locked meanwhile, and the whole answer is undone
 * in one step. If the document is changed some other way meanwhile, the
 * stream stops so that change is not lost. Resolves with the Markdown
 * received and whether it was stopped.
 */
export async function streamMarkdown(
  editor: LevitEditor,
  stream: AsyncIterable<string>,
  options: StreamMarkdownOptions = {}
): Promise<{ markdown: string; aborted: boolean }> {
  const { signal, minInterval = 30, lock = true } = options;
  if (signal?.aborted) return { markdown: '', aborted: true };

  // Every update starts again from this state, so history gets one entry.
  const base = options.base ?? editor.state;
  const plugins = editor.schema.plugins;
  // Unique per run (also across page loads), since streamed blocks keep their ids.
  const runId = generateBlockId('ai');
  let text = '';
  // Blocks before the last blank line are finished: parsed once, kept with
  // fixed ids so the editor does not redraw them on every chunk.
  const stable: BlockNode[] = [];
  let stableLength = 0;
  let aborted = false;
  // An update this stream did not make means the document changed some other way.
  let drawing = false;
  let changedOutside = false;
  const stopWatching = editor.on('update', () => {
    if (!drawing) changedOutside = true;
  });
  let lastDraw = -Infinity;

  // Spaces at the edges of the answer are kept only where it meets text.
  const edges = options.at === 'below' ? { lead: false, trail: false } : textAround(base);

  const parse = (markdown: string, firstIndex: number): BlockNode[] =>
    markdownToDocument(markdown, { plugins }).blocks.map((block, i) => ({ ...block, id: `${runId}-${firstIndex + i}` }));

  /** Draws the text so far. Returns false when the document was changed from outside. */
  const show = (final: boolean): boolean => {
    if (changedOutside) return false;
    const boundary = text.lastIndexOf('\n\n');
    if (boundary > stableLength && !insideCodeFence(text.slice(stableLength, boundary))) {
      const segment = text.slice(stableLength, boundary);
      if (segment.trim()) stable.push(...parse(segment, stable.length));
      stableLength = boundary;
    }
    const tail = text.slice(stableLength);
    const blocks = [...stable, ...(tail.trim() ? parse(final ? tail : closeOpenMarkdown(tail), stable.length) : [])];
    if (blocks.length === 0) return true;
    keepEdgeSpaces(blocks, text, edges);
    const tr = base.tr;
    if (options.at === 'below') openBlockBelow(tr);
    if (options.insert) options.insert(tr, blocks, final);
    else tr.insertFragment(blocks, { keepIds: true });
    drawing = true;
    try {
      editor.replaceState(tr.apply(), tr);
    } finally {
      drawing = false;
    }
    lastDraw = now();
    return true;
  };

  const wasEditable = editor.isEditable;
  if (lock) editor.setEditable(false);
  editor.container.setAttribute('aria-busy', 'true');
  let failure: unknown = null;
  try {
    try {
      for await (const chunk of stream) {
        if (signal?.aborted) break;
        if (!chunk) continue;
        text += chunk;
        // Long answers come in many small chunks: draw at most once per interval.
        if (now() - lastDraw >= minInterval && !show(false)) break;
      }
    } catch (error) {
      // A fetch stopped by the signal throws AbortError: that is a stop, not a failure.
      if (!signal?.aborted) failure = error;
    }
    if (signal?.aborted) aborted = true;
    if (!changedOutside && text) show(true);
    if (changedOutside) aborted = true;
  } finally {
    stopWatching();
    editor.container.removeAttribute('aria-busy');
    if (lock) editor.setEditable(wasEditable);
  }
  if (failure !== null) throw failure;
  return { markdown: text, aborted };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Puts the caret in a new paragraph after the last selected block. */
function openBlockBelow(tr: Transaction): void {
  const { to } = orderedSelection(tr.doc, tr.selection);
  const last = tr.doc.blocks[findBlockIndex(tr.doc, to.blockId)];
  const end = { blockId: last.id, offset: getBlockText(last).length };
  tr.setSelection({ anchor: end, head: end, isCollapsed: true });
  tr.splitBlock('paragraph', {});
}

/**
 * Markdown parsing trims each block, but spaces at the very start and end of
 * the answer matter when it goes into the middle of a line ("Hello |world").
 * Puts them back on the first and last text block (replacing them in the list).
 */
function keepEdgeSpaces(blocks: BlockNode[], text: string, edges: { lead: boolean; trail: boolean }): void {
  let lead = 0;
  while (edges.lead && (text[lead] === ' ' || text[lead] === '\t')) lead++;
  let trail = 0;
  while (edges.trail && trail < text.length - lead && (text[text.length - 1 - trail] === ' ' || text[text.length - 1 - trail] === '\t')) trail++;
  // Copies: the finished blocks are reused for the next chunk.
  const first = blocks[0];
  if (lead > 0 && first.type === 'paragraph') {
    blocks[0] = { ...first, content: [{ text: text.slice(0, lead), marks: [] }, ...first.content] };
  }
  const last = blocks[blocks.length - 1];
  if (trail > 0 && last.type === 'paragraph') {
    blocks[blocks.length - 1] = { ...last, content: [...last.content, { text: text.slice(text.length - trail), marks: [] }] };
  }
}

/** Whether there is text right before and right after the selection. */
function textAround(state: EditorState): { lead: boolean; trail: boolean } {
  const { from, to } = orderedSelection(state.doc, state.selection);
  const toBlock = state.doc.blocks[findBlockIndex(state.doc, to.blockId)];
  return { lead: from.offset > 0, trail: !!toBlock && to.offset < getBlockText(toBlock).length };
}

/** True when a piece of Markdown leaves a ``` code fence open. */
function insideCodeFence(markdown: string): boolean {
  let open = false;
  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) open = !open;
  }
  return open;
}

const count = (text: string, token: string) => text.split(token).length - 1;

/** A line without its leading "- ", "* " or "+ " list marker. */
function withoutListMarker(line: string): string {
  let k = 0;
  while (line[k] === ' ' || line[k] === '\t') k++;
  return '-*+'.includes(line[k] ?? '') && (line[k + 1] === ' ' || line[k + 1] === '\t') ? line.slice(k + 2) : line;
}

/**
 * Closes what the last line leaves open (a code fence, `code`, **bold**,
 * *italic*, ~~strike~~, ==highlight==), so a half-received answer is shown
 * with its formatting. Only used for display while streaming.
 */
export function closeOpenMarkdown(markdown: string): string {
  if (insideCodeFence(markdown)) return `${markdown}\n\`\`\``;
  const lastLine = markdown.slice(markdown.lastIndexOf('\n') + 1);
  if (count(lastLine, '`') % 2 === 1) return `${markdown}\``;
  // Leave out a list marker ("* item") and `code` spans: their * are not italic.
  const line = withoutListMarker(lastLine)
    .split('`')
    .filter((_, i) => i % 2 === 0)
    .join('');
  let closing = '';
  const bold = count(line, '**');
  if ((count(line, '*') - bold * 2) % 2 === 1) closing += '*';
  if (bold % 2 === 1) closing += '**';
  if (count(line, '~~') % 2 === 1) closing += '~~';
  if (count(line, '==') % 2 === 1) closing += '==';
  return markdown + closing;
}
