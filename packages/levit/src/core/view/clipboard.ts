import { BlockNode } from '../model/types.js';
import { createBlock, createTextNode, getBlockText } from '../model/document.js';
import { documentToHTML, htmlToDocument } from '../../serializers/html.js';
import { markdownToDocument } from '../../serializers/markdown.js';
import { schemaFor, type LevitPlugin } from '../plugin/plugin.js';

/** What a paste or drop should insert: blocks, or raw text for code blocks. */
export type ClipboardContent = { blocks: BlockNode[] } | { text: string };

// Lines that start like Markdown blocks: headings, lists, quotes, code fences.
const MARKDOWN_BLOCK = /^(#{1,6}\s|[-*+]\s|\d+\.\s|>|```)/m;

/**
 * Reads clipboard (or drag) data. HTML wins over plain text. Plain text with
 * several lines is read as Markdown when it looks like Markdown, otherwise
 * each line becomes a paragraph. In a code block, only plain text is used.
 */
export function readClipboard(
  data: DataTransfer,
  inCodeBlock: boolean,
  plugins: readonly LevitPlugin[] = []
): ClipboardContent | null {
  const text = (data.getData('text/plain') || '').replace(/\r\n?/g, '\n');
  const html = data.getData('text/html');

  if (inCodeBlock) {
    if (text) return { text };
    return html ? { text: htmlToDocument(html).blocks.map(getBlockText).join('\n') } : null;
  }

  if (html) {
    const blocks = htmlToDocument(html, { plugins }).blocks;
    // Keep text, and blocks without text such as images.
    const schema = schemaFor(plugins);
    if (blocks.some((b) => getBlockText(b).length > 0 || schema.isAtom(b.type))) return { blocks };
  }

  if (!text) return null;
  const lines = text.split('\n');
  if (lines.length > 1 && MARKDOWN_BLOCK.test(text)) {
    return { blocks: markdownToDocument(text, { plugins }).blocks };
  }
  return { blocks: lines.map((line) => createBlock('paragraph', {}, [createTextNode(line)])) };
}

/** Writes blocks to the clipboard as HTML and plain text. */
export function writeClipboard(data: DataTransfer, blocks: BlockNode[], plugins: readonly LevitPlugin[] = []): void {
  data.setData('text/plain', blocks.map(getBlockText).join('\n'));
  data.setData('text/html', documentToHTML({ version: 1, blocks }, { plugins }));
}
