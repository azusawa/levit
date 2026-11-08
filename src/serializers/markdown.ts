import { BlockNode, DocumentData, InlineNode } from '../core/model/types.js';
import { createBlock, createDocument, createTextNode, isListItem } from '../core/model/document.js';
import { normalizeHeadingLevel, sanitizeHref } from '../core/model/sanitize.js';

export function documentToMarkdown(doc: DocumentData): string {
  let out = '';
  let prevType: string | null = null;
  let number = 0;

  for (const block of doc.blocks) {
    let blockText = '';
    for (const node of block.content) {
      let t = node.text;
      if (node.marks && node.marks.length > 0) {
        for (const m of node.marks) {
          if (m.type === 'bold') t = `**${t}**`;
          else if (m.type === 'italic') t = `*${t}*`;
          else if (m.type === 'code') t = `\`${t}\``;
          else if (m.type === 'strike') t = `~~${t}~~`;
          else if (m.type === 'link') {
            const href = sanitizeHref(m.attrs?.href);
            if (href) t = `[${t}](${href})`;
          }
        }
      }
      blockText += t;
    }

    // A line break inside a block is a hard break: "\\" at the end of the line.
    const breaks = (indent: string) => blockText.replace(/\n/g, `\\\n${indent}`);

    let line: string;
    switch (block.type) {
      case 'heading': {
        const level = normalizeHeadingLevel(block.attrs?.level);
        line = `${'#'.repeat(level)} ${blockText.replace(/\n/g, ' ')}`;
        break;
      }
      case 'blockquote':
        line = `> ${breaks('> ')}`;
        break;
      case 'code_block':
        line = `\`\`\`\n${blockText}\n\`\`\``;
        break;
      case 'bullet_list_item':
        line = `- ${breaks('  ')}`;
        break;
      case 'ordered_list_item':
        number = prevType === 'ordered_list_item' ? number + 1 : 1;
        line = `${number}. ${breaks(' '.repeat(String(number).length + 2))}`;
        break;
      default:
        line = breaks('');
        break;
    }

    // Items of the same list sit on consecutive lines; everything else is a paragraph.
    if (prevType !== null) {
      out += prevType === block.type && isListItem(block.type) ? '\n' : '\n\n';
    }
    out += line;
    prevType = block.type;
  }

  return out;
}

/**
 * Parses markdown inline text with bold, italic, code, and links.
 */
function parseInlineMarkdown(text: string): InlineNode[] {
  if (!text) return [createTextNode('')];

  const nodes: InlineNode[] = [];
  // Tokenizer regex for bold (**...**), italic (*...*), code (`...`), link ([text](url))
  const tokenRegex = /(\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`|\[(.*?)\]\((.*?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(createTextNode(text.slice(lastIndex, match.index)));
    }

    if (match[2] !== undefined) {
      // Bold
      nodes.push(createTextNode(match[2], [{ type: 'bold' }]));
    } else if (match[3] !== undefined) {
      // Italic
      nodes.push(createTextNode(match[3], [{ type: 'italic' }]));
    } else if (match[4] !== undefined) {
      // Inline code
      nodes.push(createTextNode(match[4], [{ type: 'code' }]));
    } else if (match[5] !== undefined && match[6] !== undefined) {
      // Link
      const href = sanitizeHref(match[6]);
      nodes.push(createTextNode(match[5], href ? [{ type: 'link', attrs: { href } }] : []));
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(createTextNode(text.slice(lastIndex)));
  }

  return nodes.length > 0 ? nodes : [createTextNode('')];
}

/** Turns Markdown hard breaks ("\\" or two spaces before a newline) into "\n". */
function readHardBreaks(text: string): string {
  return text.replace(/(?:\\| {2,})\r?\n/g, '\n').replace(/\r\n/g, '\n');
}

export function markdownToDocument(markdown: string): DocumentData {
  if (!markdown || !markdown.trim()) {
    return createDocument();
  }

  const rawBlocks = markdown.split(/\r?\n\r?\n/);
  const blocks: BlockNode[] = [];

  for (const raw of rawBlocks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Heading (# ... ######)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push(createBlock('heading', { level }, parseInlineMarkdown(headingMatch[2])));
      continue;
    }

    // List items: lines start with "-", "*", "+" or "1."; indented lines continue an item.
    const lines = trimmed.split(/\r?\n/);
    const listLine = /^\s*(?:([-*+])|\d+\.)\s+(.*)$/;
    const continues = (l: string) => /^\s+\S/.test(l) && !listLine.test(l);
    if (listLine.test(lines[0]) && lines.every((l) => listLine.test(l) || continues(l))) {
      const items: { type: string; text: string }[] = [];
      for (const l of lines) {
        const m = l.match(listLine);
        if (m) items.push({ type: m[1] ? 'bullet_list_item' : 'ordered_list_item', text: m[2] });
        else items[items.length - 1].text += `\n${l.trim()}`;
      }
      for (const item of items) {
        blocks.push(createBlock(item.type, {}, parseInlineMarkdown(readHardBreaks(item.text))));
      }
      continue;
    }

    // Blockquote: every line starts with ">"
    if (lines.every((l) => /^\s*>/.test(l))) {
      const text = lines.map((l) => l.replace(/^\s*>\s?/, '')).join('\n');
      blocks.push(createBlock('blockquote', {}, parseInlineMarkdown(readHardBreaks(text))));
      continue;
    }

    // Code block (``` ... ```)
    const codeMatch = trimmed.match(/^```[\w]*\n?([\s\S]*?)```$/);
    if (codeMatch) {
      blocks.push(createBlock('code_block', {}, [createTextNode(codeMatch[1].trim())]));
      continue;
    }

    // Default paragraph
    blocks.push(createBlock('paragraph', {}, parseInlineMarkdown(readHardBreaks(trimmed))));
  }

  return createDocument(blocks.length > 0 ? blocks : undefined);
}
