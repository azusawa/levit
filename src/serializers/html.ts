import { BlockNode, DocumentData, InlineMark, InlineNode } from '../core/model/types.js';
import {
  createBlock,
  createDocument,
  createTextNode,
  listIndent,
  normalizeInlineNodes,
} from '../core/model/document.js';
import { normalizeHeadingLevel, sanitizeHref } from '../core/model/sanitize.js';

/** The element that holds each kind of list item, and how it is opened. */
const LISTS: Record<string, { tag: string; open: string }> = {
  bullet_list_item: { tag: 'ul', open: '<ul>' },
  ordered_list_item: { tag: 'ol', open: '<ol>' },
  task_list_item: { tag: 'ul', open: '<ul class="levit-task-list">' },
};

export function documentToHTML(doc: DocumentData): string {
  let html = '';
  // Open lists, one per nesting level. Each has an <li> that is still open,
  // because a nested list goes inside its parent's <li>.
  const lists: string[] = [];
  const closeListsTo = (depth: number) => {
    while (lists.length > depth) html += `</li></${LISTS[lists.pop()!].tag}>`;
  };

  for (const block of doc.blocks) {
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
          else if (m.type === 'highlight') t = `<mark>${t}</mark>`;
          else if (m.type === 'code') t = `<code>${t}</code>`;
          else if (m.type === 'link') {
            const href = sanitizeHref(m.attrs?.href);
            if (href) t = `<a href="${escapeHTML(href)}">${t}</a>`;
          }
        }
      }
      contentHtml += t;
    }
    // Browsers hide a final <br>, so a trailing line break needs a second one.
    if (!isCode && block.content.map((c) => c.text).join('').endsWith('\n')) {
      contentHtml += '<br>';
    }

    switch (block.type) {
      case 'heading': {
        const level = normalizeHeadingLevel(block.attrs?.level);
        html += `<h${level}>${contentHtml}</h${level}>`;
        break;
      }
      case 'blockquote':
        html += `<blockquote>${contentHtml}</blockquote>`;
        break;
      case 'code_block':
        html += `<pre><code>${contentHtml}</code></pre>`;
        break;
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
      default:
        html += `<p>${contentHtml}</p>`;
        break;
    }
  }

  closeListsTo(0);
  return html;
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
  'iframe', 'object', 'embed', 'svg', 'math', 'img', 'video', 'audio', 'canvas',
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
  ...CONTAINER_TAGS, ...LEAF_TAGS, 'blockquote', 'pre', 'ul', 'ol', 'li', 'hr',
]);

/** The block type for loose content, and the nesting level of the list we are in. */
type Context = { type: string; depth?: number; checked?: boolean };

/** Attributes for a block made in this context: nested list items get their level. */
function attrsFor(ctx: Context): Record<string, any> {
  const attrs: Record<string, any> = ctx.type.endsWith('list_item') && ctx.depth ? { indent: ctx.depth } : {};
  if (ctx.type === 'task_list_item') attrs.checked = ctx.checked === true;
  return attrs;
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

export function htmlToDocument(html: string): DocumentData {
  if (!html || !html.trim()) {
    return createDocument();
  }

  // DOMParser documents are inert: scripts do not run and images do not load.
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const blocks: BlockNode[] = [];
  readBlocks(parsed.body, { type: 'paragraph' }, blocks);
  return createDocument(blocks.length > 0 ? blocks : undefined);
}

const tagOf = (node: Node) => (node as Element).tagName?.toLowerCase() ?? '';

function isBlockElement(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(tagOf(node));
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
    if (child.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has(tagOf(child))) continue;
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

function readBlockElement(el: Element, ctx: Context, out: BlockNode[]): void {
  const tag = tagOf(el);

  if (/^h[1-6]$/.test(tag)) {
    out.push(createBlock('heading', { level: parseInt(tag[1], 10) }, readInline(Array.from(el.childNodes))));
  } else if (LEAF_TAGS.has(tag)) {
    // An explicit block is kept even when empty (e.g. <p><br></p> spacing).
    out.push(createBlock(ctx.type, attrsFor(ctx), readInline(Array.from(el.childNodes))));
  } else if (tag === 'blockquote') {
    readBlocks(el, { type: 'blockquote' }, out);
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
    out.push(createBlock('code_block', {}, [createTextNode(text)]));
  } else if (tag === 'hr') {
    // No horizontal rule block yet.
  } else {
    readBlocks(el, ctx, out);
  }
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
    if (child.nodeType === Node.ELEMENT_NODE && SKIP_TAGS.has(tagOf(child))) continue;
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

  if (tag === 'strong' || tag === 'b') add('bold');
  else if (tag === 'em' || tag === 'i') add('italic');
  else if (tag === 'u' || tag === 'ins') add('underline');
  else if (tag === 's' || tag === 'strike' || tag === 'del') add('strike');
  else if (tag === 'code' || tag === 'kbd' || tag === 'samp') add('code');
  else if (tag === 'mark') add('highlight');
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
