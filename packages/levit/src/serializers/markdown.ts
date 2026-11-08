import { BlockNode, DocumentData, InlineNode } from '../core/model/types.js';
import {
  BUILT_IN_BLOCK_TYPES,
  normalizeInlineNodes,
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
            // Brackets in link text are escaped, and a URL with spaces,
            // brackets or parentheses goes in <...>, so the link reads back whole.
            if (href) {
              const url = /[\s()[\]<>]/.test(href) ? `<${href}>` : href;
              t = `[${t.replace(/[[\]\\]/g, '\\$&')}](${url})`;
            }
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
 * Parses inline Markdown: **bold**, *italic*, `code`, [link](url),
 * ~~strike~~ and ==highlight==. Marks do not cross line breaks, so each line
 * is read on its own.
 */
function parseInlineMarkdown(text: string): InlineNode[] {
  if (!text) return [createTextNode('')];
  const nodes: InlineNode[] = [];
  text.split('\n').forEach((line, i) => {
    if (i > 0) nodes.push(createTextNode('\n'));
    nodes.push(...parseInlineLine(line));
  });
  return normalizeInlineNodes(nodes);
}

/** Simple marks: [opening and closing text, mark type, at least one character inside]. */
const DELIMITED: [string, string, boolean][] = [
  ['**', 'bold', false],
  ['*', 'italic', false],
  ['`', 'code', false],
  ['~~', 'strike', true],
  ['==', 'highlight', true],
];

/**
 * Reads one line in a single pass, without regular expressions: crafted
 * input made the earlier pattern-based parser take seconds. Searches for a
 * closing marker remember where they failed, and brackets are matched once
 * up front, so the work stays linear in the length of the line.
 */
function parseInlineLine(line: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  // Searching for `token` from any position at or after this one finds nothing.
  const notFoundFrom = new Map<string, number>();
  const find = (token: string, from: number): number => {
    if (from >= (notFoundFrom.get(token) ?? Infinity)) return -1;
    const at = line.indexOf(token, from);
    if (at === -1) notFoundFrom.set(token, from);
    return at;
  };
  const closingBracket = matchBrackets(line);

  let plainStart = 0;
  let i = 0;
  const emit = (end: number, node: InlineNode) => {
    if (i > plainStart) nodes.push(createTextNode(line.slice(plainStart, i)));
    nodes.push(node);
    i = end;
    plainStart = end;
  };

  while (i < line.length) {
    const delimited = DELIMITED.find(([marker]) => line.startsWith(marker, i));
    if (delimited) {
      const [marker, type, needsText] = delimited;
      const close = find(marker, i + marker.length + (needsText ? 1 : 0));
      if (close !== -1) {
        emit(close + marker.length, createTextNode(line.slice(i + marker.length, close), [{ type }]));
        continue;
      }
    }
    if (line[i] === '[') {
      const link = readLink(line, i, closingBracket);
      if (link) {
        const href = sanitizeHref(link.href);
        emit(link.end, createTextNode(link.text, href ? [{ type: 'link', attrs: { href } }] : []));
        continue;
      }
    }
    i += 1;
  }
  if (plainStart < line.length) nodes.push(createTextNode(line.slice(plainStart)));
  return nodes;
}

/** For each "[", the index of its matching "]". Backslash escapes a bracket. */
function matchBrackets(line: string): Map<number, number> {
  const pairs = new Map<number, number>();
  const open: number[] = [];
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (c === '\\') k++;
    else if (c === '[') open.push(k);
    else if (c === ']' && open.length > 0) pairs.set(open.pop()!, k);
  }
  return pairs;
}

/**
 * Reads [text](url) or [text](<url>) starting at a "[". The URL scan stops at
 * brackets, so scans from different links never cover the same characters.
 */
function readLink(
  line: string,
  start: number,
  closingBracket: Map<number, number>
): { text: string; href: string; end: number } | null {
  const close = closingBracket.get(start);
  if (close === undefined || line[close + 1] !== '(') return null;
  const text = line.slice(start + 1, close).replace(/\\([[\]\\])/g, '$1');

  let k = close + 2;
  if (line[k] === '<') {
    // <url>: may hold spaces and brackets, ends at ">)".
    k += 1;
    while (k < line.length && line[k] !== '>' && line[k] !== '<') k++;
    if (line[k] !== '>' || line[k + 1] !== ')') return null;
    return { text, href: line.slice(close + 3, k), end: k + 2 };
  }
  while (k < line.length && !/[)\s[\]<]/.test(line[k])) k++;
  if (line[k] !== ')') return null;
  return { text, href: line.slice(close + 2, k), end: k + 1 };
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
  // The language is what directly follows the fence, up to a space or backtick.
  let languageEnd = 3;
  while (languageEnd < infoEnd && !/[\s`]/.test(block[languageEnd])) languageEnd++;
  const language = block.slice(3, languageEnd);
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
    // Any whitespace may follow the #s (also a full-width space or a line
    // break), and the heading text must be a single line.
    const heading = /^#{1,6}(?=\s)/.exec(trimmed);
    const headingText = heading ? trimmed.slice(heading[0].length).trimStart() : '';
    if (heading && !headingText.includes('\n')) {
      blocks.push(createBlock('heading', { level: heading[0].length }, parseInlineMarkdown(headingText)));
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
