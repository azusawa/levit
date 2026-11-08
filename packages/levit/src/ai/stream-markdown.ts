import type { LevitEditor } from '../core/editor.js';
import type { BlockNode } from '../core/model/types.js';
import { markdownToDocument } from '../serializers/markdown.js';

export interface StreamMarkdownOptions {
  /** Stops the stream; what arrived so far is kept. */
  signal?: AbortSignal;
}

let runCount = 0;

/**
 * Streams Markdown (an AI answer) into the editor at the caret, replacing
 * the selection. Headings, lists, bold and the rest appear formatted while
 * the text arrives; formatting that is not closed yet (like "**bo") is shown
 * as if it were. Editing is locked meanwhile, and the whole answer is undone
 * in one step. Resolves with the Markdown received and whether it was aborted.
 */
export async function streamMarkdown(
  editor: LevitEditor,
  stream: AsyncIterable<string>,
  options: StreamMarkdownOptions = {}
): Promise<{ markdown: string; aborted: boolean }> {
  const { signal } = options;
  if (signal?.aborted) return { markdown: '', aborted: true };

  // Every update starts again from this state, so history gets one entry.
  const base = editor.state;
  const plugins = editor.schema.plugins;
  const runId = `ai${++runCount}`;
  let text = '';
  // Blocks before the last blank line are finished: parsed once, kept with
  // fixed ids so the editor does not redraw them on every chunk.
  const stable: BlockNode[] = [];
  let stableLength = 0;
  let aborted = false;

  const parse = (markdown: string, firstIndex: number): BlockNode[] =>
    markdownToDocument(markdown, { plugins }).blocks.map((block, i) => ({ ...block, id: `${runId}-${firstIndex + i}` }));

  const show = (final: boolean) => {
    const boundary = text.lastIndexOf('\n\n');
    if (boundary > stableLength && !insideCodeFence(text.slice(stableLength, boundary))) {
      const segment = text.slice(stableLength, boundary);
      if (segment.trim()) stable.push(...parse(segment, stable.length));
      stableLength = boundary;
    }
    const tail = text.slice(stableLength);
    const blocks = [...stable, ...(tail.trim() ? parse(final ? tail : closeOpenMarkdown(tail), stable.length) : [])];
    if (blocks.length === 0) return;
    keepEdgeSpaces(blocks, text);
    const tr = base.tr;
    tr.insertFragment(blocks, { keepIds: true });
    editor.replaceState(tr.apply());
  };

  editor.setEditable(false);
  editor.container.setAttribute('aria-busy', 'true');
  try {
    for await (const chunk of stream) {
      if (signal?.aborted) {
        aborted = true;
        break;
      }
      if (!chunk) continue;
      text += chunk;
      show(false);
    }
    if (signal?.aborted) aborted = true;
    if (text) show(true);
  } finally {
    editor.container.removeAttribute('aria-busy');
    editor.setEditable(true);
  }
  return { markdown: text, aborted };
}

/**
 * Markdown parsing trims each block, but spaces at the very start and end of
 * the answer matter when it goes into the middle of a line ("Hello |world").
 * Puts them back on the first and last text block (replacing them in the list).
 */
function keepEdgeSpaces(blocks: BlockNode[], text: string): void {
  let lead = 0;
  while (text[lead] === ' ' || text[lead] === '\t') lead++;
  let trail = 0;
  while (trail < text.length - lead && (text[text.length - 1 - trail] === ' ' || text[text.length - 1 - trail] === '\t')) trail++;
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

/** True when a piece of Markdown leaves a ``` code fence open. */
function insideCodeFence(markdown: string): boolean {
  let open = false;
  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) open = !open;
  }
  return open;
}

const count = (text: string, token: string) => text.split(token).length - 1;

/**
 * Closes what the last line leaves open (a code fence, `code`, **bold**,
 * *italic*, ~~strike~~, ==highlight==), so a half-received answer is shown
 * with its formatting. Only used for display while streaming.
 */
export function closeOpenMarkdown(markdown: string): string {
  if (insideCodeFence(markdown)) return `${markdown}\n\`\`\``;
  const line = markdown.slice(markdown.lastIndexOf('\n') + 1);
  if (count(line, '`') % 2 === 1) return `${markdown}\``;
  let closing = '';
  const bold = count(line, '**');
  if ((count(line, '*') - bold * 2) % 2 === 1) closing += '*';
  if (bold % 2 === 1) closing += '**';
  if (count(line, '~~') % 2 === 1) closing += '~~';
  if (count(line, '==') % 2 === 1) closing += '==';
  return markdown + closing;
}
