import { BlockNode, DocumentData, InlineNode } from '../core/model/types';
import { createBlock, createDocument, createTextNode } from '../core/model/document';
import { normalizeHeadingLevel, sanitizeHref } from '../core/model/sanitize';

export function documentToMarkdown(doc: DocumentData): string {
  const lines: string[] = [];

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

    switch (block.type) {
      case 'heading': {
        const level = normalizeHeadingLevel(block.attrs?.level);
        lines.push(`${'#'.repeat(level)} ${blockText}`);
        break;
      }
      case 'blockquote':
        lines.push(`> ${blockText}`);
        break;
      case 'code_block':
        lines.push(`\`\`\`\n${blockText}\n\`\`\``);
        break;
      default:
        lines.push(blockText);
        break;
    }
  }

  return lines.join('\n\n');
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

    // Blockquote (> ...)
    const quoteMatch = trimmed.match(/^>\s*(.*)$/);
    if (quoteMatch) {
      blocks.push(createBlock('blockquote', {}, parseInlineMarkdown(quoteMatch[1])));
      continue;
    }

    // Code block (``` ... ```)
    const codeMatch = trimmed.match(/^```[\w]*\n?([\s\S]*?)```$/);
    if (codeMatch) {
      blocks.push(createBlock('code_block', {}, [createTextNode(codeMatch[1].trim())]));
      continue;
    }

    // Default paragraph
    blocks.push(createBlock('paragraph', {}, parseInlineMarkdown(trimmed)));
  }

  return createDocument(blocks.length > 0 ? blocks : undefined);
}
