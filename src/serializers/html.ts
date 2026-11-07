import { BlockNode, DocumentData, InlineMark, InlineNode } from '../core/model/types.js';
import { createBlock, createDocument, createTextNode } from '../core/model/document.js';
import { normalizeHeadingLevel, sanitizeHref } from '../core/model/sanitize.js';

const LIST_TAGS: Record<string, string> = {
  bullet_list_item: 'ul',
  ordered_list_item: 'ol',
};

export function documentToHTML(doc: DocumentData): string {
  let html = '';
  // Consecutive list items of the same kind share one <ul>/<ol>.
  let openList: string | null = null;

  for (const block of doc.blocks) {
    const listTag = LIST_TAGS[block.type] ?? null;
    if (listTag !== openList) {
      if (openList) html += `</${openList}>`;
      if (listTag) html += `<${listTag}>`;
      openList = listTag;
    }

    let contentHtml = '';
    for (const node of block.content) {
      let t = escapeHTML(node.text);
      if (node.marks && node.marks.length > 0) {
        for (const m of node.marks) {
          if (m.type === 'bold') t = `<strong>${t}</strong>`;
          else if (m.type === 'italic') t = `<em>${t}</em>`;
          else if (m.type === 'underline') t = `<u>${t}</u>`;
          else if (m.type === 'strike') t = `<s>${t}</s>`;
          else if (m.type === 'code') t = `<code>${t}</code>`;
          else if (m.type === 'link') {
            const href = sanitizeHref(m.attrs?.href);
            if (href) t = `<a href="${escapeHTML(href)}">${t}</a>`;
          }
        }
      }
      contentHtml += t;
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
        html += `<li>${contentHtml}</li>`;
        break;
      default:
        html += `<p>${contentHtml}</p>`;
        break;
    }
  }

  if (openList) html += `</${openList}>`;
  return html;
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function htmlToDocument(html: string): DocumentData {
  if (!html || !html.trim()) {
    return createDocument();
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const body = doc.body;

  const blocks: BlockNode[] = [];

  for (let i = 0; i < body.children.length; i++) {
    const el = body.children[i];
    const tagName = el.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tagName)) {
      const level = parseInt(tagName[1], 10);
      blocks.push(createBlock('heading', { level }, parseDOMNodes(el)));
    } else if (tagName === 'blockquote') {
      blocks.push(createBlock('blockquote', {}, parseDOMNodes(el)));
    } else if (tagName === 'ul' || tagName === 'ol') {
      const type = tagName === 'ul' ? 'bullet_list_item' : 'ordered_list_item';
      for (const item of Array.from(el.children)) {
        if (item.tagName.toLowerCase() === 'li') {
          blocks.push(createBlock(type, {}, parseDOMNodes(item)));
        }
      }
    } else if (tagName === 'pre') {
      const code = el.querySelector('code');
      const text = (code || el).textContent || '';
      blocks.push(createBlock('code_block', {}, [createTextNode(text)]));
    } else {
      blocks.push(createBlock('paragraph', {}, parseDOMNodes(el)));
    }
  }

  return createDocument(blocks.length > 0 ? blocks : undefined);
}

function parseDOMNodes(parent: Element): InlineNode[] {
  const inlineNodes: InlineNode[] = [];

  function walk(node: Node, currentMarks: InlineMark[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || '';
      if (text) {
        inlineNodes.push({
          text,
          marks: currentMarks.length > 0 ? [...currentMarks] : [],
        });
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase();
      const nextMarks = [...currentMarks];

      if (tag === 'strong' || tag === 'b') nextMarks.push({ type: 'bold' });
      else if (tag === 'em' || tag === 'i') nextMarks.push({ type: 'italic' });
      else if (tag === 'u') nextMarks.push({ type: 'underline' });
      else if (tag === 's' || tag === 'strike' || tag === 'del') nextMarks.push({ type: 'strike' });
      else if (tag === 'code') nextMarks.push({ type: 'code' });
      else if (tag === 'a') {
        const href = sanitizeHref(el.getAttribute('href'));
        if (href) nextMarks.push({ type: 'link', attrs: { href } });
      }

      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i], nextMarks);
      }
    }
  }

  for (let i = 0; i < parent.childNodes.length; i++) {
    walk(parent.childNodes[i], []);
  }

  return inlineNodes.length > 0 ? inlineNodes : [createTextNode('')];
}

