import { colorCSS, HIGHLIGHT_FALLBACK, isClearColor, nearestColor, normalizeColor, type ColorKind } from '../core/model/colors.js';
import { BlockNode, DocumentData, InlineMark, InlineNode } from '../core/model/types.js';
import {
  BUILT_IN_BLOCK_TYPES,
  createBlock,
  createDocument,
  createTextNode,
  generateBlockId,
  getBlockText,
  sliceBlockContent,
  listIndent,
  normalizeInlineNodes,
} from '../core/model/document.js';
import { cellContent, createCell, tableAtIndex, type TablePosition } from '../core/model/table.js';
import { defaultSchema, schemaFor, type BlockSpec, type Schema, type SerializerOptions } from '../core/plugin/plugin.js';
import { normalizeCodeLanguage, normalizeHeadingLevel, sanitizeHref, sanitizeImageSrc } from '../core/model/sanitize.js';
import { calloutAttrs, calloutKind, normalizeCalloutKind, type CalloutKind } from '../core/model/callout.js';
import { isToggleOpen, toggleAttrs, toggleSummaryLength } from '../core/model/toggle.js';
import { IMAGE_WIDTHS, normalizeImageAlign, normalizeImageSize } from '../core/model/image.js';
import { blockTextAlign, canAlignText, normalizeTextAlign } from '../core/model/align.js';

/** The element that holds each kind of list item, and how it is opened. */
const LISTS: Record<string, { tag: string; open: string }> = {
  bullet_list_item: { tag: 'ul', open: '<ul>' },
  ordered_list_item: { tag: 'ol', open: '<ol>' },
  task_list_item: { tag: 'ul', open: '<ul class="levit-task-list">' },
};

const BUILT_IN_HTML_BLOCKS = new Set(BUILT_IN_BLOCK_TYPES);

/**
 * An image's size and alignment, as data attributes Levit reads back and a
 * style that shows them where Levit's CSS is not loaded, like in an email.
 */
function imageSettings(block: BlockNode): string {
  const size = normalizeImageSize(block.attrs?.size);
  const align = normalizeImageAlign(block.attrs?.align);
  if (!size && !align) return '';
  const style = ['display: block'];
  if (size) style.push(`width: ${IMAGE_WIDTHS[size]}`);
  if (align) style.push(`margin-left: auto${align === 'center' ? '; margin-right: auto' : ''}`);
  return `${size ? ` data-size="${size}"` : ''}${align ? ` data-align="${align}"` : ''} style="${style.join('; ')}"`;
}

/** A paragraph's, heading's or quote's alignment, as a style attribute. */
function alignStyle(block: BlockNode): string {
  const align = blockTextAlign(block);
  return align ? ` style="text-align: ${align}"` : '';
}

export function documentToHTML(doc: DocumentData, options: SerializerOptions = {}): string {
  const schema = schemaFor(options.plugins);
  let html = '';
  // Open lists, one per nesting level. Each has an <li> that is still open,
  // because a nested list goes inside its parent's <li>.
  const lists: string[] = [];
  const closeListsTo = (depth: number) => {
    while (lists.length > depth) html += `</li></${LISTS[lists.pop()!].tag}>`;
  };

  for (let index = 0; index < doc.blocks.length; index++) {
    const block = doc.blocks[index];
    const table = tableAtIndex(doc.blocks, index);
    if (table) {
      closeListsTo(0);
      html += tableHTML(doc.blocks, table, (b) => inlineHTML(b, schema));
      index = table.end;
      continue;
    }
    const list = LISTS[block.type];
    if (list) {
      // An item can be at most one level deeper than the list it follows.
      const level = Math.min(listIndent(block), lists.length);
      closeListsTo(level + 1);
      if (lists.length === level + 1) {
        if (lists[level] === block.type) html += '</li>';
        else closeListsTo(level);
      }
      if (lists.length === level) {
        html += list.open;
        lists.push(block.type);
      }
    } else {
      closeListsTo(0);
    }

    const contentHtml = inlineHTML(block, schema);

    switch (block.type) {
      case 'heading': {
        const level = normalizeHeadingLevel(block.attrs?.level);
        html += `<h${level}${alignStyle(block)}>${contentHtml}</h${level}>`;
        break;
      }
      case 'blockquote':
        html += `<blockquote${alignStyle(block)}>${contentHtml}</blockquote>`;
        break;
      case 'toggle_block': {
        const length = toggleSummaryLength(block);
        const text = getBlockText(block);
        const part = (from: number, to: number) => inlineHTML({ ...block, content: sliceBlockContent(block, from, to) }, schema);
        const body = length < text.length ? `<p>${part(length + 1, text.length)}</p>` : '';
        html += `<details${isToggleOpen(block) ? ' open' : ''}><summary>${part(0, length)}</summary>${body}</details>`;
        break;
      }
      case 'callout_block':
        html += `<aside data-callout="${calloutKind(block)}">${contentHtml}</aside>`;
        break;
      case 'horizontal_rule':
        html += '<hr>';
        break;
      case 'image': {
        const src = sanitizeImageSrc(block.attrs?.src);
        if (src) html += `<img src="${escapeHTML(src)}" alt="${escapeHTML(String(block.attrs?.alt ?? ''))}"${imageSettings(block)}>`;
        break;
      }
      case 'code_block': {
        const language = normalizeCodeLanguage(block.attrs?.language);
        html += `<pre><code${language ? ` class="language-${language}"` : ''}>${contentHtml}</code></pre>`;
        break;
      }
      case 'bullet_list_item':
      case 'ordered_list_item':
        // Closed when the next item or the list ends.
        html += `<li>${contentHtml}`;
        break;
      case 'task_list_item': {
        const checked = block.attrs?.checked === true;
        html += `<li data-checked="${checked}"><input type="checkbox" disabled${checked ? ' checked' : ''}>${contentHtml}`;
        break;
      }
      default: {
        const spec = schema.blocks.get(block.type);
        if (spec) html += spec.toHTML ? spec.toHTML(block, contentHtml) : spec.atom ? '' : `<p>${contentHtml}</p>`;
        // A block type nobody defined keeps its text, if it has any.
        else if (BUILT_IN_HTML_BLOCKS.has(block.type) || contentHtml !== '') html += `<p${alignStyle(block)}>${contentHtml}</p>`;
        break;
      }
    }
  }

  closeListsTo(0);
  return html;
}

/**
 * Colored text or highlight: the color name for Levit to read back, and a
 * style with the light value so the color shows where theme.css is not
 * loaded, as in an email. A highlight without a color is a plain <mark>.
 */
function colored(tag: 'mark' | 'span', property: string, mark: InlineMark, kind: ColorKind, html: string): string {
  const color = normalizeColor(mark.attrs?.color);
  const css = colorCSS(color, kind, tag === 'mark' ? HIGHLIGHT_FALLBACK : undefined);
  if (!color || !css) return tag === 'mark' ? `<mark>${html}</mark>` : html;
  return `<${tag} data-color="${escapeHTML(color)}" style="${property}: ${escapeHTML(css)}">${html}</${tag}>`;
}

/** A block's text as HTML, with its marks. */
function inlineHTML(block: BlockNode, schema: Schema): string {
  const isCode = block.type === 'code_block';
  let contentHtml = '';
  for (const node of block.content) {
    let t = escapeHTML(node.text);
    if (!isCode) t = t.replace(/\n/g, '<br>');
    if (node.marks && node.marks.length > 0) {
      for (const m of node.marks) {
        if (m.type === 'bold') t = `<strong>${t}</strong>`;
        else if (m.type === 'italic') t = `<em>${t}</em>`;
        else if (m.type === 'underline') t = `<u>${t}</u>`;
        else if (m.type === 'strike') t = `<s>${t}</s>`;
        else if (m.type === 'highlight') t = colored('mark', 'background-color', m, 'background', t);
        else if (m.type === 'color' && !schema.marks.has('color')) t = colored('span', 'color', m, 'text', t);
        else if (m.type === 'code') t = `<code>${t}</code>`;
        else if (m.type === 'link') {
          const href = sanitizeHref(m.attrs?.href);
          if (href) t = `<a href="${escapeHTML(href)}">${t}</a>`;
        } else {
          const spec = schema.marks.get(m.type);
          if (spec?.toHTML) t = spec.toHTML(t, m);
        }
      }
    }
    contentHtml += t;
  }
  // Browsers hide a final <br>, so a trailing line break needs a second one.
  if (!isCode && block.content.map((c) => c.text).join('').endsWith('\n')) {
    contentHtml += '<br>';
  }
  return contentHtml;
}

/** A table: leading rows of header cells go in <thead>, the rest in <tbody>. */
function tableHTML(blocks: readonly BlockNode[], table: TablePosition, inline: (block: BlockNode) => string): string {
  const isHeader = (row: number[]) => row.every((k) => blocks[k].attrs?.header === true);
  let head = 0;
  while (head < table.rows.length && isHeader(table.rows[head])) head += 1;
  const rows = (rows: number[][]) =>
    rows
      .map((row) => `<tr>${row.map((k) => {
        const tag = blocks[k].attrs?.header === true ? 'th' : 'td';
        const color = normalizeColor(blocks[k].attrs?.background);
        const border = normalizeColor(blocks[k].attrs?.border);
        // The lines are written whole, so they show where Levit's CSS is not.
        const style = [color && `background-color: ${colorCSS(color, 'background')}`, border && `border: 1px solid ${colorCSS(border, 'border')}`]
          .filter(Boolean)
          .join('; ');
        const data = (color ? ` data-color="${escapeHTML(color)}"` : '') + (border ? ` data-border="${escapeHTML(border)}"` : '');
        const attrs = style ? `${data} style="${escapeHTML(style)}"` : '';
        return `<${tag}${attrs}>${inline(blocks[k])}</${tag}>`;
      }).join('')}</tr>`)
      .join('');
  let html = '<table>';
  if (head > 0) html += `<thead>${rows(table.rows.slice(0, head))}</thead>`;
  if (head < table.rows.length) html += `<tbody>${rows(table.rows.slice(head))}</tbody>`;
  return `${html}</table>`;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Import ---------------------------------------------------------------
// Pasted HTML comes from many sources (browsers, Google Docs, Word), so the
// parser walks the tree: block elements become blocks, everything between
// them is inline content, and unknown containers are looked through.

/** Elements whose content is never imported. */
const SKIP_TAGS = new Set([
  'script', 'style', 'template', 'noscript', 'head', 'meta', 'link', 'title',
  'iframe', 'object', 'embed', 'svg', 'math', 'video', 'audio', 'canvas',
  'button', 'input', 'select', 'textarea',
]);

/** Block containers that are looked through; their children become blocks. */
const CONTAINER_TAGS = new Set([
  'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'figure', 'form', 'fieldset', 'details', 'center', 'body', 'html',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'dl',
]);

/** Elements that hold one block of inline content. */
const LEAF_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'dt', 'dd',
  'figcaption', 'summary', 'address', 'caption', 'legend',
]);

const BLOCK_TAGS = new Set([
  ...CONTAINER_TAGS, ...LEAF_TAGS, 'blockquote', 'pre', 'ul', 'ol', 'li', 'hr', 'img',
]);

/**
 * The block type for loose content, the nesting level of the list we are in,
 * and the alignment of the element around it.
 */
type Context = { type: string; depth?: number; checked?: boolean; align?: string | null; kind?: CalloutKind };

/** Attributes for a block made in this context: nested list items get their level. */
function attrsFor(ctx: Context): Record<string, any> {
  const attrs: Record<string, any> = ctx.type.endsWith('list_item') && ctx.depth ? { indent: ctx.depth } : {};
  if (ctx.type === 'task_list_item') attrs.checked = ctx.checked === true;
  const kind = ctx.type === 'callout_block' && ctx.kind ? calloutAttrs(ctx.kind) : {};
  if (ctx.align && canAlignText(ctx.type)) attrs.align = ctx.align;
  return { ...attrs, ...kind };
}

/**
 * An element's alignment: its text-align style or align attribute. Left (or
 * start) is the default and gives null; undefined means it sets none, so the
 * alignment around it holds.
 */
function alignOf(el: Element): string | null | undefined {
  if (tagOf(el) === 'center') return 'center';
  const style = /(?:^|;)\s*text-align\s*:\s*([a-z-]+)/i.exec(el.getAttribute('style') ?? '');
  const value = (style?.[1] ?? el.getAttribute('align'))?.toLowerCase();
  if (value === undefined) return undefined;
  if (value in PASTED_ALIGNS) return PASTED_ALIGNS[value];
  // inherit, match-parent and values we do not know keep the alignment around it.
  return normalizeTextAlign(value) ?? undefined;
}

/**
 * Alignment values other editors and browsers write, for left-to-right text.
 * Chrome writes -webkit-center when it copies centered text.
 */
const PASTED_ALIGNS: Record<string, string | null> = {
  left: null,
  start: null,
  '-webkit-left': null,
  '-webkit-center': 'center',
  '-webkit-right': 'right',
  end: 'right',
};

/** The context with the element's own alignment, when it sets one. */
function alignedContext(el: Element, ctx: Context): Context {
  const align = alignOf(el);
  return align === undefined ? ctx : { ...ctx, align };
}

/**
 * Whether an <li> is a checked (true) or open (false) task, or null if it is
 * not a task. Reads data-checked (Levit, Tiptap) or a leading checkbox (GitHub).
 */
function taskState(li: Element): boolean | null {
  const data = li.getAttribute('data-checked');
  if (data === 'true' || data === 'false') return data === 'true';
  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE && !(child.nodeValue ?? '').trim()) continue;
    const box = tagOf(child) === 'input' ? (child as Element) : (child as Element).querySelector?.(':scope > input');
    if (box && box.getAttribute('type') === 'checkbox') return box.hasAttribute('checked');
    return null;
  }
  return null;
}

// The plugins of the htmlToDocument call in progress. Reading is synchronous,
// so a module variable is enough and keeps the reader functions simple.
let schema: Schema = defaultSchema;

export function htmlToDocument(html: string, options: SerializerOptions = {}): DocumentData {
  if (!html || !html.trim()) {
    return createDocument();
  }

  // DOMParser documents are inert: scripts do not run and images do not load.
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks: BlockNode[] = [];
  const previous = schema;
  schema = schemaFor(options.plugins);
  try {
    readBlocks(parsed.body, { type: 'paragraph' }, blocks);
  } finally {
    schema = previous;
  }
  return createDocument(blocks.length > 0 ? blocks : undefined);
}

const tagOf = (node: Node) => (node as Element).tagName?.toLowerCase() ?? '';

/** The plugin block that claims an element, with the attrs it read. */
function claimBlock(node: Node): { spec: BlockSpec; attrs: Record<string, any> } | null {
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  for (const spec of schema.blocks.values()) {
    const attrs = spec.parseHTML?.(node as Element);
    if (attrs) return { spec, attrs };
  }
  return null;
}

/** True when an element has an image or a plugin block somewhere inside it. */
function holdsBlocks(el: Element): boolean {
  return Array.from(el.querySelectorAll('*')).some((child) => tagOf(child) === 'img' || claimBlock(child) !== null);
}

function isBlockElement(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (BLOCK_TAGS.has(tagOf(node)) || claimBlock(node) !== null);
}

/** True for an inline element that wraps blocks, like Google Docs' <b> wrapper. */
function wrapsBlocks(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE || SKIP_TAGS.has(tagOf(node))) return false;
  return Array.from(node.childNodes).some((c) => isBlockElement(c) || wrapsBlocks(c));
}

function readBlocks(parent: Node, ctx: Context, out: BlockNode[]): void {
  let run: Node[] = [];
  const flush = () => {
    if (run.length > 0) {
      // Loose inline content becomes a block, unless it is only whitespace.
      const content = readInline(run);
      if (content.some((n) => n.text.length > 0)) out.push(createBlock(ctx.type, attrsFor(ctx), content));
      run = [];
    }
  };

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has(tagOf(child)) && !claimBlock(child)) continue;
    if (child.nodeType !== Node.ELEMENT_NODE && child.nodeType !== Node.TEXT_NODE) continue;

    if (isBlockElement(child)) {
      flush();
      readBlockElement(child as Element, ctx, out);
    } else if (wrapsBlocks(child)) {
      flush();
      readBlocks(child, ctx, out);
    } else {
      run.push(child);
    }
  }
  flush();
}

function readBlockElement(el: Element, outer: Context, out: BlockNode[]): void {
  const tag = tagOf(el);
  const ctx = alignedContext(el, outer);
  const claimed = claimBlock(el);

  if (claimed) {
    const { spec, attrs } = claimed;
    const content = spec.atom ? [createTextNode('')] : readInline(Array.from(el.childNodes));
    out.push(createBlock(spec.type, attrs, content));
  } else if (tag === 'img') {
    const src = sanitizeImageSrc(el.getAttribute('src'));
    if (src) {
      const attrs: Record<string, string> = { src, alt: el.getAttribute('alt') ?? '' };
      // On the <img> as Levit writes it, or on a <figure> around it (Levit's
      // own editor, copied by the browser).
      const setting = (name: string) => el.getAttribute(name) ?? el.closest('figure')?.getAttribute(name);
      const size = normalizeImageSize(setting('data-size'));
      const align = normalizeImageAlign(setting('data-align'));
      if (size) attrs.size = size;
      if (align) attrs.align = align;
      out.push(createBlock('image', attrs));
    }
  } else if (/^h[1-6]$/.test(tag) || (LEAF_TAGS.has(tag) && !holdsBlocks(el))) {
    readLeaf(el, tag, ctx, out);
  } else if (LEAF_TAGS.has(tag)) {
    // A paragraph with images (or plugin blocks): its text and those become separate blocks.
    readBlocks(el, ctx, out);
  } else if (tag === 'table') {
    readTable(el, out);
  } else if (tag === 'details') {
    readToggle(el, out);
  } else if (tag === 'aside' && el.hasAttribute('data-callout')) {
    const kind = normalizeCalloutKind(el.getAttribute('data-callout')) ?? 'note';
    const before = out.length;
    readBlocks(el, { type: 'callout_block', kind }, out);
    // A callout holding only lists, code and the like still keeps its box, empty.
    if (!out.slice(before).some((b) => b.type === 'callout_block')) out.splice(before, 0, createBlock('callout_block', calloutAttrs(kind)));
  } else if (tag === 'blockquote') {
    readBlocks(el, { type: 'blockquote', align: ctx.align }, out);
  } else if (tag === 'ul' || tag === 'ol') {
    // A list inside another list (usually inside its <li>) is one level deeper.
    const depth = ctx.depth === undefined ? 0 : ctx.depth + 1;
    readBlocks(el, { type: tag === 'ul' ? 'bullet_list_item' : 'ordered_list_item', depth }, out);
  } else if (tag === 'li') {
    const type = ctx.type.endsWith('list_item') ? ctx.type : 'bullet_list_item';
    const checked = taskState(el);
    if (checked === null) readListItem(el, { type, depth: ctx.depth ?? 0 }, out);
    else readListItem(el, { type: 'task_list_item', depth: ctx.depth ?? 0, checked }, out);
  } else if (tag === 'pre') {
    const text = (el.textContent || '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
    const language = codeLanguageOf(el);
    out.push(createBlock('code_block', language ? { language } : {}, [createTextNode(text)]));
  } else if (tag === 'hr') {
    out.push(createBlock('horizontal_rule'));
  } else {
    readBlocks(el, ctx, out);
  }
}

/**
 * A <details> becomes a toggle: its <summary> is the first line, and the text
 * and paragraphs after it are the other lines. Lists, code and other blocks
 * inside it follow the toggle as blocks of their own.
 */
function readToggle(el: Element, out: BlockNode[]): void {
  const summary = Array.from(el.children).find((c) => tagOf(c) === 'summary');
  const rest = el.cloneNode(true) as Element;
  Array.from(rest.children).find((c) => tagOf(c) === 'summary')?.remove();
  const inner: BlockNode[] = [];
  readBlocks(rest, { type: 'paragraph' }, inner);
  const lines = inner.findIndex((b) => b.type !== 'paragraph');
  const body = lines === -1 ? inner : inner.slice(0, lines);
  const content = [
    ...(summary ? readInline(Array.from(summary.childNodes)) : []),
    ...body.flatMap((b) => [createTextNode('\n'), ...b.content]),
  ];
  const attrs = toggleAttrs(el.hasAttribute('open'));
  out.push(createBlock('toggle_block', attrs, normalizeInlineNodes(content.length > 0 ? content : [createTextNode('')])));
  if (lines !== -1) out.push(...inner.slice(lines));
}

/** Widest a pasted cell may be (colspan), so a huge colspan cannot make thousands of cells. */
const MAX_COLSPAN = 64;

/** Reads a table's rows into cells. Its caption goes before it as a paragraph. */
function readTable(table: Element, out: BlockNode[]): void {
  const rows: Element[] = [];
  for (const child of Array.from(table.children)) {
    const tag = tagOf(child);
    if (tag === 'tr') rows.push(child);
    else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') rows.push(...Array.from(child.children).filter((c) => tagOf(c) === 'tr'));
    else if (tag === 'caption') readLeaf(child, 'caption', { type: 'paragraph' }, out);
  }
  const tableId = generateBlockId('t');
  for (const tr of rows) {
    const rowId = generateBlockId('r');
    for (const td of Array.from(tr.children)) {
      const tag = tagOf(td);
      if (tag !== 'td' && tag !== 'th') continue;
      const header = tag === 'th';
      const span = Math.min(Math.max(parseInt(td.getAttribute('colspan') ?? '1', 10) || 1, 1), MAX_COLSPAN);
      const background = cellBackground(td);
      const border = cellBorder(td);
      const make = () => {
        const c = createCell(tableId, rowId, header);
        return { ...c, attrs: { ...c.attrs, ...(background && { background }), ...(border && { border }) } };
      };
      out.push({ ...make(), content: readCell(td) });
      for (let k = 1; k < span; k++) out.push(make());
    }
  }
  // One line color for the table: the first one a cell gives.
  const cells = out.filter((b) => b.type === 'table_cell' && b.attrs?.table === tableId);
  const border = cells.find((c) => c.attrs?.border)?.attrs?.border;
  for (const c of cells) {
    if (border) c.attrs = { ...c.attrs, border };
  }
}

/** A cell's color: Levit's own by name, others as the nearest named color. */
function cellBackground(td: Element): string | null {
  const own = normalizeColor(td.getAttribute('data-color'));
  if (own) return own;
  const css = (td as HTMLElement).style?.backgroundColor;
  return css ? nearestColor(css, 'background') : null;
}

/** A cell's line color: Levit's own by name, others as the nearest named color. */
function cellBorder(td: Element): string | null {
  const own = normalizeColor(td.getAttribute('data-border'));
  if (own) return own;
  const style = (td as HTMLElement).style;
  if (!style) return null;
  for (const css of [style.borderTopColor, style.borderBottomColor, style.borderLeftColor, style.borderRightColor]) {
    const color = css && nearestColor(css, 'border');
    if (color) return color;
  }
  return null;
}

/** A cell's content: its paragraphs, list items and nested tables as lines of text. */
function readCell(td: Element): InlineNode[] {
  const blocks: BlockNode[] = [];
  readBlocks(td, { type: 'paragraph' }, blocks);
  return cellContent(blocks, (type) => schema.isAtom(type)) ?? [createTextNode('')];
}

/** The language of a <pre>: data-language, or a language-x / lang-x class on it or its <code>. */
function codeLanguageOf(pre: Element): string | null {
  for (const el of [pre, pre.querySelector('code')]) {
    if (!el) continue;
    const data = normalizeCodeLanguage(el.getAttribute('data-language'));
    if (data) return data;
    for (const name of Array.from(el.classList)) {
      const m = /^(?:language|lang)-(.+)$/.exec(name);
      const language = m && normalizeCodeLanguage(m[1]);
      if (language) return language;
    }
  }
  return null;
}

function readLeaf(el: Element, tag: string, ctx: Context, out: BlockNode[]): void {
  const content = readInline(Array.from(el.childNodes));
  if (/^h[1-6]$/.test(tag)) {
    const level = parseInt(tag[1], 10);
    out.push(createBlock('heading', ctx.align ? { level, align: ctx.align } : { level }, content));
  }
  // An explicit block is kept even when empty (e.g. <p><br></p> spacing).
  else out.push(createBlock(ctx.type, attrsFor(ctx), content));
}

/** A list item's own text is one item; nested lists and paragraphs follow it. */
function readListItem(li: Element, ctx: Context, out: BlockNode[]): void {
  const { type } = ctx;
  const own: Node[] = [];
  const rest: Node[] = [];
  for (const child of Array.from(li.childNodes)) {
    if (rest.length > 0 || isBlockElement(child) || wrapsBlocks(child)) rest.push(child);
    else own.push(child);
  }

  if (own.length > 0 || rest.length === 0) {
    const content = readInline(own);
    if (content.some((n) => n.text.length > 0) || rest.length === 0) out.push(createBlock(type, attrsFor(ctx), content));
  }
  for (const child of rest) {
    if (child.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has(tagOf(child)) && !claimBlock(child)) continue;
    if (isBlockElement(child)) readBlockElement(child as Element, ctx, out);
    else if (wrapsBlocks(child)) readBlocks(child, ctx, out);
    else {
      const content = readInline([child]);
      if (content.some((n) => n.text.length > 0)) out.push(createBlock(type, attrsFor(ctx), content));
    }
  }
}

function marksFor(el: Element, marks: InlineMark[]): InlineMark[] {
  const tag = tagOf(el);
  let next = [...marks];
  const add = (type: string) => {
    if (!next.some((m) => m.type === type)) next.push({ type });
  };
  const remove = (type: string) => {
    next = next.filter((m) => m.type !== type);
  };
  const setColor = (type: string, color: string | null) => {
    remove(type);
    next.push(color ? { type, attrs: { color } } : { type });
  };

  for (const spec of schema.marks.values()) {
    const attrs = spec.parseHTML?.(el);
    if (attrs) {
      next = next.filter((m) => m.type !== spec.type);
      next.push(Object.keys(attrs).length > 0 ? { type: spec.type, attrs } : { type: spec.type });
    }
  }

  if (tag === 'strong' || tag === 'b') add('bold');
  else if (tag === 'em' || tag === 'i') add('italic');
  else if (tag === 'u' || tag === 'ins') add('underline');
  else if (tag === 's' || tag === 'strike' || tag === 'del') add('strike');
  else if (tag === 'code' || tag === 'kbd' || tag === 'samp') add('code');
  else if (tag === 'mark') setColor('highlight', normalizeColor(el.getAttribute('data-color')));
  else if (tag === 'a') {
    const href = sanitizeHref(el.getAttribute('href'));
    if (href) {
      next = next.filter((m) => m.type !== 'link');
      next.push({ type: 'link', attrs: { href } });
    }
  }

  // Inline styles, as used by Google Docs and Word.
  const style = (el as HTMLElement).style;
  if (style) {
    const weight = style.fontWeight;
    if (weight === 'bold' || weight === 'bolder' || Number(weight) >= 600) add('bold');
    else if (weight === 'normal' || weight === 'lighter' || (weight && Number(weight) < 600)) remove('bold');

    if (style.fontStyle === 'italic' || style.fontStyle === 'oblique') add('italic');
    else if (style.fontStyle === 'normal') remove('italic');

    const decoration = `${style.textDecoration ?? ''} ${style.getPropertyValue('text-decoration-line') ?? ''}`;
    if (decoration.includes('underline')) add('underline');
    if (decoration.includes('line-through')) add('strike');

    // Levit's own colors carry their name; colors from elsewhere become the
    // nearest named color, and black text the default.
    const own = el.hasAttribute('data-color') ? normalizeColor(el.getAttribute('data-color')) : null;
    if (schema.marks.has('color')) {
      // The app's own color mark reads its colors.
    } else if (tag === 'span' && own) setColor('color', own);
    else if (tag !== 'mark' && style.color) {
      const color = nearestColor(style.color, 'text');
      if (color) setColor('color', color);
      else remove('color');
    }
    // A clear background shows what is behind it; any other takes the place
    // of a highlight around it.
    if (tag !== 'mark' && !own && style.backgroundColor && !isClearColor(style.backgroundColor)) {
      const background = nearestColor(style.backgroundColor, 'background');
      if (background) setColor('highlight', background);
      else remove('highlight');
    }
  }

  return next;
}

/**
 * Reads inline nodes the way a browser lays them out: runs of whitespace
 * become one space, <br> is a line break, and spaces at line edges go away.
 */
function readInline(nodes: Node[]): InlineNode[] {
  const out: InlineNode[] = [];

  const walk = (node: Node, marks: InlineMark[]) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.nodeValue || '').replace(/[ \t\n\r\f]+/g, ' ');
      if (text) out.push({ text, marks });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = tagOf(el);
    if (SKIP_TAGS.has(tag)) return;
    if (tag === 'br') {
      out.push({ text: '\n', marks });
      return;
    }
    const next = marksFor(el, marks);
    for (const child of Array.from(el.childNodes)) walk(child, next);
  };
  for (const node of nodes) walk(node, []);

  // Drop the trailing <br> browsers add to blocks, then trim around line edges.
  const last = out[out.length - 1];
  if (last && last.text === '\n') out.pop();

  // Decide per character which spaces survive: none at a line start or end,
  // and none right after another space.
  const text = out.map((n) => n.text).join('');
  // Index by UTF-16 code unit, like the rest of the model (not by code point).
  const keep = Array.from({ length: text.length }, (_, i) => {
    if (text[i] !== ' ') return true;
    const prev = text[i - 1];
    const rest = text.slice(i + 1);
    const atLineStart = prev === undefined || prev === '\n' || prev === ' ';
    const atLineEnd = /^ *(\n|$)/.test(rest);
    return !atLineStart && !atLineEnd;
  });

  let pos = 0;
  const trimmed: InlineNode[] = [];
  for (const node of out) {
    let t = '';
    for (let i = 0; i < node.text.length; i++, pos++) {
      if (keep[pos]) t += node.text[i];
    }
    if (t) trimmed.push({ text: t.replace(/\u00a0/g, ' '), marks: node.marks?.length ? node.marks : [] });
  }
  return trimmed.length > 0 ? normalizeInlineNodes(trimmed) : [createTextNode('')];
}
