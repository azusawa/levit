import { BlockNode, DocumentData, InlineNode } from '../core/model/types.js';
import {
  BUILT_IN_BLOCK_TYPES,
  normalizeInlineNodes,
  createBlock,
  createDocument,
  createTextNode,
  generateBlockId,
  isListItem,
  listIndent,
} from '../core/model/document.js';
import { schemaFor, type Schema, type SerializerOptions } from '../core/plugin/plugin.js';
import { createCell, splitTableRow, tableAtIndex, type TablePosition } from '../core/model/table.js';
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

  for (let index = 0; index < doc.blocks.length; index++) {
    const block = doc.blocks[index];
    const table = tableAtIndex(doc.blocks, index);
    const blockText = table ? '' : inlineMarkdown(block, schema);

    // A line break inside a block is a hard break: "\\" at the end of the line.
    const breaks = (indent: string) => blockText.replace(/\n/g, `\\\n${indent}`);

    let line: string;
    if (table) {
      line = tableMarkdown(doc.blocks, table, (b) => inlineMarkdown(b, schema));
      index = table.end;
    } else switch (block.type) {
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
        line = `![${escapeLabel(String(block.attrs?.alt ?? ''))}](${formatDestination(src)})`;
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

/** A block's text as Markdown, with its marks. */
function inlineMarkdown(block: BlockNode, schema: Schema): string {
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
          if (href) t = `[${escapeLabel(t)}](${formatDestination(href)})`;
        } else {
          const spec = schema.marks.get(m.type);
          if (spec?.toMarkdown) t = spec.toMarkdown(t, m);
        }
      }
    }
    // Backslashes right before a link would escape its "[": double them.
    if (t.startsWith('[') && node.marks?.some((m) => m.type === 'link')) {
      blockText += '\\'.repeat(trailingBackslashes(blockText));
    }
    blockText += t;
  }
  return blockText;
}

/**
 * A GitHub table. Markdown tables always have a header row: a table without
 * one gets an empty header row, which reading leaves out again. Pipes in
 * cells are escaped, line breaks become <br>, and short rows get empty cells.
 */
function tableMarkdown(blocks: readonly BlockNode[], table: TablePosition, inline: (block: BlockNode) => string): string {
  const cols = Math.max(...table.rows.map((row) => row.length));
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const rows = table.rows.map((row) =>
    Array.from({ length: cols }, (_, c) =>
      row[c] === undefined ? '' : inline(blocks[row[c]]).replace(/\|/g, '\\|').replace(/\n/g, '<br>')
    )
  );
  const hasHeader = table.rows[0].every((k) => blocks[k].attrs?.header === true);
  const head = hasHeader ? rows[0] : Array(cols).fill('');
  const body = hasHeader ? rows.slice(1) : rows;
  return [line(head), line(Array(cols).fill('---')), ...body.map(line)].join('\n');
}

/** True when lines[k] and lines[k + 1] start a GitHub table: a header row, then a delimiter row like "| --- | :-: |". */
function startsTable(lines: string[], k: number): boolean {
  const head = lines[k];
  const delimiterLine = lines[k + 1];
  if (head === undefined || delimiterLine === undefined || !head.includes('|') || !delimiterLine.includes('-')) return false;
  const delimiter = splitTableRow(delimiterLine);
  return delimiter.length === splitTableRow(head).length && delimiter.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Reads a GitHub table, or null. A header row of empty cells is how a table
 * without a header is written, so it is left out.
 */
function readTable(lines: string[]): BlockNode[] | null {
  if (!startsTable(lines, 0)) return null;
  const header = splitTableRow(lines[0]);
  const tableId = generateBlockId('t');
  const blocks: BlockNode[] = [];
  const row = (cells: string[], isHeader: boolean) => {
    const rowId = generateBlockId('r');
    for (let c = 0; c < header.length; c++) {
      const text = (cells[c] ?? '').replace(/<br\s*\/?>/gi, '\n');
      blocks.push({ ...createCell(tableId, rowId, isHeader), content: parseInlineMarkdown(text) });
    }
  };
  if (header.some((cell) => cell !== '')) row(header, true);
  for (const line of lines.slice(2)) row(splitTableRow(line), false);
  return blocks.length > 0 ? blocks : null;
}

/**
 * Splits a block of lines before a table that follows text without a blank
 * line ("Results:" then "| a | b |"), as GitHub does.
 */
function splitBeforeTable(raw: string): string[] {
  if (raw.trimStart().startsWith('```')) return [raw];
  const lines = raw.split('\n');
  for (let k = 1; k < lines.length - 1; k++) {
    if (startsTable(lines, k)) return [lines.slice(0, k).join('\n'), lines.slice(k).join('\n')];
  }
  return [raw];
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
    // A loop, not push(...nodes): a long line can give more nodes than a
    // function call may take as arguments.
    for (const node of parseInlineLine(line)) nodes.push(node);
  });
  return normalizeInlineNodes(nodes);
}

/** Turns Markdown hard breaks ("\\" or two spaces before a newline) into "\n". */
function readHardBreaks(text: string): string {
  // (?<! ) starts a run of spaces only at its first space, so a long run
  // without a newline after it is not rescanned from every space.
  return text.replace(/(?:\\|(?<! ) {2,})\r?\n/g, '\n').replace(/\r\n/g, '\n');
}

/** Simple marks: [opening and closing text, mark type, at least one character inside]. */
const DELIMITED: [string, string, boolean][] = [
  ['**', 'bold', false],
  ['*', 'italic', false],
  ['`', 'code', false],
  ['~~', 'strike', true],
  ['==', 'highlight', true],
];

/** Escapes link text and image alt text: brackets and backslashes. */
const escapeLabel = (text: string) => text.replace(/[[\]\\]/g, '\\$&');
const unescapeLabel = (text: string) => text.replace(/\\([[\]\\])/g, '$1');

/**
 * A link or image destination. URLs with whitespace or parentheses (or that
 * start with "<") go in <...>, where < and > are percent-encoded.
 */
function formatDestination(url: string): string {
  if (!/[\s()]/.test(url) && !url.startsWith('<')) return url;
  return `<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>`;
}

/** Number of backslashes at the end of a string. */
function trailingBackslashes(text: string): number {
  let n = 0;
  while (n < text.length && text[text.length - 1 - n] === '\\') n++;
  return n;
}

/**
 * indexOf that remembers its last answer per token, so searches that start
 * inside a range already searched cost nothing. This keeps a line with many
 * unclosed markers linear instead of rescanning it from each one.
 */
function makeFinder(line: string) {
  const last = new Map<string, { from: number; at: number }>();
  return (token: string, from: number): number => {
    const known = last.get(token);
    if (known && from >= known.from && (known.at === -1 || from <= known.at)) return known.at;
    const at = line.indexOf(token, from);
    last.set(token, { from, at });
    return at;
  };
}

/**
 * Reads one line in a single pass, without regular expressions: crafted
 * input made the earlier pattern-based parser take seconds. Link text is read
 * again with links turned off (links do not nest), so every character is read
 * at most twice.
 */
function parseInlineLine(line: string, allowLinks = true): InlineNode[] {
  const nodes: InlineNode[] = [];
  const find = makeFinder(line);
  const closingBracket = allowLinks ? matchBrackets(line) : new Map<number, number>();
  let plainStart = 0;
  let i = 0;
  const pushPlain = (end: number, beforeLink = false) => {
    let text = line.slice(plainStart, end);
    // The serializer doubles backslashes right before a link (see export).
    if (beforeLink) text = text.slice(0, text.length - trailingBackslashes(text) / 2);
    if (text) nodes.push(createTextNode(text));
  };

  scan: while (i < line.length) {
    for (const [marker, type, needsText] of DELIMITED) {
      if (!line.startsWith(marker, i)) continue;
      const close = find(marker, i + marker.length + (needsText ? 1 : 0));
      if (close === -1) continue;
      pushPlain(i);
      nodes.push(createTextNode(line.slice(i + marker.length, close), [{ type }]));
      i = plainStart = close + marker.length;
      continue scan;
    }
    if (line[i] === '[' && allowLinks) {
      const link = readLink(line, i, closingBracket, find);
      if (link) {
        pushPlain(i, true);
        const href = sanitizeHref(link.href);
        for (const node of parseInlineLine(link.text, false)) {
          nodes.push(href ? { text: node.text, marks: [...(node.marks ?? []), { type: 'link', attrs: { href } }] } : node);
        }
        i = plainStart = link.end;
        continue;
      }
    }
    i += 1;
  }
  pushPlain(line.length);
  return nodes;
}

/** For each "[", the index of its matching "]". Backslash escapes the next character. */
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
 * Reads [text](url), [text](url "title") or [text](<url>) at a "[". The
 * destination runs to the first ")" (or ">)" in the <...> form); searches go
 * through `find`, so they never rescan the line.
 */
function readLink(
  line: string,
  start: number,
  closingBracket: Map<number, number>,
  find: (token: string, from: number) => number
): { text: string; href: string; end: number } | null {
  const close = closingBracket.get(start);
  if (close === undefined || line[close + 1] !== '(') return null;
  const text = () => unescapeLabel(line.slice(start + 1, close));
  const from = close + 2;

  if (line[from] === '<') {
    const end = find('>', from + 1);
    if (end === -1 || line[end + 1] !== ')') return null;
    return { text: text(), href: line.slice(from + 1, end), end: end + 2 };
  }
  const end = find(')', from);
  if (end === -1) return null;
  const destination = line.slice(from, end).trim();
  // A title after the URL ("title" or 'title') is not part of the href.
  const titled = /^(\S+)\s+(?:"[^"]*"|'[^']*')$/.exec(destination);
  return { text: text(), href: titled ? titled[1] : destination, end: end + 1 };
}

const isSpace = (c: string | undefined) => c !== undefined && c.trim() === '';

/**
 * Reads a list line: indent, then "-", "*", "+" or "1.", then whitespace and
 * the text. Done by hand: the regular expression it replaces backtracked on
 * long runs of spaces.
 */
function readListLine(line: string): { indent: string; bullet?: string; text: string } | null {
  let k = 0;
  while (isSpace(line[k])) k++;
  const indent = line.slice(0, k);
  let bullet: string | undefined;
  if (line[k] === '-' || line[k] === '*' || line[k] === '+') {
    bullet = line[k];
    k += 1;
  } else {
    const digits = k;
    while (line[k] >= '0' && line[k] <= '9') k++;
    if (k === digits || line[k] !== '.') return null;
    k += 1;
  }
  if (!isSpace(line[k])) return null;
  return { indent, bullet, text: line.slice(k).trimStart() };
}

/** "[ ] text" or "[x] text" at the start of a list item's text. */
function readTaskBox(text: string): { checked: boolean; text: string } | null {
  if (text[0] !== '[' || text[2] !== ']' || !' xX'.includes(text[1]) || !isSpace(text[3])) return null;
  return { checked: text[1] !== ' ', text: text.slice(3).trimStart() };
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
  // Keep the code as written: only the line break before the closing fence goes.
  const text = newline === -1 ? '' : block.slice(newline + 1, -3).replace(/\n[ \t]*$/, '');
  return { language, text };
}

/**
 * Splits Markdown into blocks at blank lines. A fenced code block is one block,
 * blank lines and all, even without blank lines around it.
 */
function splitBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let fence = false;
  const flush = () => {
    if (current.length > 0) blocks.push(current.join('\n'));
    current = [];
  };
  const lines = markdown.split(/\r?\n/);
  let fenceStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isFence = /^ {0,3}```/.test(line);
    if (fence) {
      current.push(line);
      if (/^ {0,3}```\s*$/.test(line)) {
        fence = false;
        flush();
      }
    } else if (isFence) {
      flush();
      current.push(line);
      fence = true;
      fenceStart = i;
    } else if (line.trim() === '') {
      flush();
    } else {
      current.push(line);
    }
  }
  if (fence) {
    // A fence that never closes is not a code block: read its lines again as
    // ordinary blocks, split at blank lines.
    current = [];
    fence = false;
    for (const line of lines.slice(fenceStart)) {
      if (line.trim() === '') flush();
      else current.push(line);
    }
  }
  flush();
  return blocks;
}

export function markdownToDocument(markdown: string, options: SerializerOptions = {}): DocumentData {
  const schema = schemaFor(options.plugins);
  if (!markdown || !markdown.trim()) {
    return createDocument();
  }

  const rawBlocks = splitBlocks(markdown).flatMap(splitBeforeTable);
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
      const alt = unescapeLabel(imageMatch[1]);
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

    // Table: a header row, a delimiter row, then rows.
    const table = readTable(lines);
    if (table) {
      blocks.push(...table);
      continue;
    }
    const continues = (l: string) => /^\s+\S/.test(l) && !readListLine(l);
    if (readListLine(lines[0]) && lines.every((l) => readListLine(l) || continues(l))) {
      const items: { type: string; text: string; indent: number; checked?: boolean }[] = [];
      // Columns of the markers of the open parent items. An item indented past
      // its parent's marker is nested under it.
      const parents: number[] = [];
      for (const l of lines) {
        const m = readListLine(l);
        if (!m) {
          items[items.length - 1].text += `\n${l.trim()}`;
          continue;
        }
        const column = m.indent.replace(/\t/g, '    ').length;
        while (parents.length > 0 && column <= parents[parents.length - 1]) parents.pop();
        const task = m.bullet ? readTaskBox(m.text) : null;
        items.push({
          type: task ? 'task_list_item' : m.bullet ? 'bullet_list_item' : 'ordered_list_item',
          text: task ? task.text : m.text,
          indent: parents.length,
          checked: task ? task.checked : undefined,
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
