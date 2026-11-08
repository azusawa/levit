import { BlockNode, DocumentData, InlineNode } from '../core/model/types.js';
import {
  BUILT_IN_BLOCK_TYPES,
  createBlock,
  createDocument,
  createTextNode,
  isListItem,
  listIndent,
} from '../core/model/document.js';
import { schemaFor, type SerializerOptions } from '../core/plugin/plugin.js';
import { normalizeCodeLanguage, normalizeHeadingLevel, sanitizeHref, sanitizeImageSrc } from '../core/model/sanitize.js';

const BUILT_IN_MARKDOWN_BLOCKS = new Set(BUILT_IN_BLOCK_TYPES);

export function documentToMarkdown(doc: DocumentData, options: SerializerOptions = {}): string {
  const schema = schemaFor(options.plugins);
  let out = '';
  let prevType: string | null = null;
  let prevIndent = 0;
  // Per nesting level: the item number, and how far the item's text is
  // indented (nested items go under the text of their parent).
  const numbers: number[] = [];
  const widths: number[] = [];

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
          else if (m.type === 'highlight') t = `==${t}==`;
          else if (m.type === 'link') {
            const href = sanitizeHref(m.attrs?.href);
            // Brackets in link text are escaped so the link reads back whole.
            if (href) t = `[${t.replace(/[[\]\\]/g, '\\$&')}](${href})`;
          } else {
            const spec = schema.marks.get(m.type);
            if (spec?.toMarkdown) t = spec.toMarkdown(t, m);
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
        line = `\`\`\`${normalizeCodeLanguage(block.attrs?.language) ?? ''}\n${blockText}\n\`\`\``;
        break;
      case 'horizontal_rule':
        line = '---';
        break;
      case 'image': {
        const src = sanitizeImageSrc(block.attrs?.src);
        if (!src) continue;
        const alt = String(block.attrs?.alt ?? '').replace(/[[\]\\]/g, '\\$&');
        line = `![${alt}](${/[\s()<>]/.test(src) ? `<${src}>` : src})`;
        break;
      }
      case 'bullet_list_item':
      case 'ordered_list_item':
      case 'task_list_item': {
        const level = Math.min(listIndent(block), widths.length);
        numbers.length = widths.length = level + 1;
        const ordered = block.type === 'ordered_list_item';
        // A bullet at the same level ends a run of numbers.
        numbers[level] = ordered ? (numbers[level] ?? 0) + 1 : 0;
        const marker = ordered ? `${numbers[level]}. ` : '- ';
        const box = block.type === 'task_list_item' ? (block.attrs?.checked === true ? '[x] ' : '[ ] ') : '';
        const prefix = ' '.repeat(widths.slice(0, level).reduce((a, b) => a + b, 0));
        widths[level] = marker.length;
        line = `${prefix}${marker}${box}${breaks(prefix + ' '.repeat(marker.length))}`;
        break;
      }
      default: {
        const spec = schema.blocks.get(block.type);
        if (spec?.toMarkdown) line = spec.toMarkdown(block, blockText);
        else if (spec?.atom) continue;
        // A block type nobody defined keeps its text, if it has any.
        else if (!spec && !BUILT_IN_MARKDOWN_BLOCKS.has(block.type) && blockText === '') continue;
        else line = breaks('');
        break;
      }
    }

    if (!isListItem(block.type)) numbers.length = widths.length = 0;

    // Items of the same list sit on consecutive lines; everything else is a paragraph.
    if (prevType !== null) {
      const nested = listIndent(block) > 0 || prevIndent > 0;
      const sameList = isListItem(block.type) && isListItem(prevType) && (prevType === block.type || nested);
      out += sameList ? '\n' : '\n\n';
    }
    out += line;
    prevType = block.type;
    prevIndent = listIndent(block);
  }

  return out;
}

/**
 * Parses markdown inline text with bold, italic, code, and links.
 */
function parseInlineMarkdown(text: string): InlineNode[] {
  if (!text) return [createTextNode('')];

  const nodes: InlineNode[] = [];
  // Tokens: bold (**...**), italic (*...*), code (`...`), link ([text](url)),
  // strikethrough (~~...~~) and highlight (==...==).
  // Link text is plain characters, escaped characters (\[) or one level of
  // [brackets]; URLs have no spaces or brackets. Every match attempt stops
  // at the next bracket, so runs of "[" or "](" cannot make the search scan
  // the whole line again from each one (which took seconds on crafted text).
  const tokenRegex =
    /(\*\*(.*?)\*\*|\*(.*?)\*|`(.*?)`|\[((?:\\.|\[[^[\]\n]*\]|[^[\]\\\n])*)\]\(([^)\s[\]]*)\)|~~(.+?)~~|==(.+?)==)/g;
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
      const text = match[5].replace(/\\([[\]\\])/g, '$1');
      nodes.push(createTextNode(text, href ? [{ type: 'link', attrs: { href } }] : []));
    } else if (match[7] !== undefined) {
      nodes.push(createTextNode(match[7], [{ type: 'strike' }]));
    } else if (match[8] !== undefined) {
      nodes.push(createTextNode(match[8], [{ type: 'highlight' }]));
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
  // (?<! ) starts a run of spaces only at its first space, so a long run
  // without a newline after it is not rescanned from every space.
  return text.replace(/(?:\\|(?<! ) {2,})\r?\n/g, '\n').replace(/\r\n/g, '\n');
}

/**
 * Reads a fenced code block (```lang ... ```). Done with string methods: the
 * regular expression this replaces took minutes on a long first line.
 */
function readCodeFence(block: string): { language: string; text: string } | null {
  if (block.length < 6 || !block.startsWith('```') || !block.endsWith('```')) return null;
  const newline = block.indexOf('\n');
  const infoEnd = newline === -1 ? block.length - 3 : newline;
  const language = block.slice(3, infoEnd).trim().split(/[ \t]/)[0];
  const text = newline === -1 ? '' : block.slice(newline + 1, -3).trim();
  return { language, text };
}

export function markdownToDocument(markdown: string, options: SerializerOptions = {}): DocumentData {
  const schema = schemaFor(options.plugins);
  if (!markdown || !markdown.trim()) {
    return createDocument();
  }

  const rawBlocks = markdown.split(/\r?\n\r?\n/);
  const blocks: BlockNode[] = [];

  for (const raw of rawBlocks) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    // Plugin blocks get the first look.
    let claimed = false;
    for (const spec of schema.blocks.values()) {
      const result = spec.parseMarkdown?.(trimmed);
      if (!result) continue;
      const content = spec.atom ? [createTextNode('')] : parseInlineMarkdown(readHardBreaks(result.text ?? ''));
      blocks.push(createBlock(spec.type, { ...result.attrs }, content));
      claimed = true;
      break;
    }
    if (claimed) continue;

    // Divider: three or more -, * or _
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      blocks.push(createBlock('horizontal_rule'));
      continue;
    }

    // Image on its own line: ![alt](src) or ![alt](<src>)
    const imageMatch = trimmed.match(/^!\[((?:\\.|[^\]\\])*)\]\((?:<([^>]*)>|(\S*))\)$/);
    const imageSrc = imageMatch && sanitizeImageSrc(imageMatch[2] ?? imageMatch[3]);
    if (imageMatch && imageSrc) {
      const alt = imageMatch[1].replace(/\\(.)/g, '$1');
      blocks.push(createBlock('image', { src: imageSrc, alt }));
      continue;
    }

    // Heading (# ... ######)
    const heading = /^#{1,6}(?=[ \t])/.exec(trimmed);
    if (heading && !trimmed.includes('\n')) {
      const level = heading[0].length;
      blocks.push(createBlock('heading', { level }, parseInlineMarkdown(trimmed.slice(level).trim())));
      continue;
    }

    // List items: lines start with "-", "*", "+" or "1."; indented lines continue an item.
    const lines = raw.replace(/^\n+/, '').trimEnd().split(/\r?\n/);
    const listLine = /^(\s*)(?:([-*+])|\d+\.)\s+(.*)$/;
    const continues = (l: string) => /^\s+\S/.test(l) && !listLine.test(l);
    if (listLine.test(lines[0]) && lines.every((l) => listLine.test(l) || continues(l))) {
      const items: { type: string; text: string; indent: number; checked?: boolean }[] = [];
      // Columns of the markers of the open parent items. An item indented past
      // its parent's marker is nested under it.
      const parents: number[] = [];
      for (const l of lines) {
        const m = l.match(listLine);
        if (!m) {
          items[items.length - 1].text += `\n${l.trim()}`;
          continue;
        }
        const column = m[1].replace(/\t/g, '    ').length;
        while (parents.length > 0 && column <= parents[parents.length - 1]) parents.pop();
        const task = m[2] ? /^\[([ xX])\]\s+(.*)$/.exec(m[3]) : null;
        items.push({
          type: task ? 'task_list_item' : m[2] ? 'bullet_list_item' : 'ordered_list_item',
          text: task ? task[2] : m[3],
          indent: parents.length,
          checked: task ? task[1] !== ' ' : undefined,
        });
        parents.push(column);
      }
      for (const item of items) {
        const attrs: Record<string, any> = item.indent > 0 ? { indent: item.indent } : {};
        if (item.checked !== undefined) attrs.checked = item.checked;
        blocks.push(createBlock(item.type, attrs, parseInlineMarkdown(readHardBreaks(item.text))));
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
    const code = readCodeFence(trimmed);
    if (code) {
      const language = normalizeCodeLanguage(code.language);
      blocks.push(createBlock('code_block', language ? { language } : {}, [createTextNode(code.text)]));
      continue;
    }

    // Default paragraph
    blocks.push(createBlock('paragraph', {}, parseInlineMarkdown(readHardBreaks(trimmed))));
  }

  return createDocument(blocks.length > 0 ? blocks : undefined);
}
