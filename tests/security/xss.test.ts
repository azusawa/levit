import { describe, it, expect } from 'vitest';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { sanitizeHref, normalizeHeadingLevel } from '../../src/core/model/sanitize';
import { EditorState } from '../../src/core/state/state';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { documentFromJSON } from '../../src/serializers/json';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';

const UNSAFE_HREFS = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  '\u0001javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
];

const SAFE_HREFS = [
  'https://example.com',
  'http://example.com/a?b=c',
  'mailto:me@example.com',
  '/relative/path',
  'relative/path',
  '#anchor',
  '?q=1',
];

function linkDoc(href: unknown) {
  return createDocument([
    createBlock('paragraph', {}, [createTextNode('click', [{ type: 'link', attrs: { href } }])]),
  ]);
}

describe('sanitizeHref', () => {
  it.each(UNSAFE_HREFS)('rejects unsafe href %j', (href) => {
    expect(sanitizeHref(href)).toBeNull();
  });

  it.each(SAFE_HREFS)('keeps safe href %j', (href) => {
    expect(sanitizeHref(href)).toBe(href);
  });

  it('rejects non-string and empty values', () => {
    expect(sanitizeHref(undefined)).toBeNull();
    expect(sanitizeHref(42)).toBeNull();
    expect(sanitizeHref('')).toBeNull();
  });
});

describe('normalizeHeadingLevel', () => {
  it('clamps numbers to 1-6', () => {
    expect(normalizeHeadingLevel(3)).toBe(3);
    expect(normalizeHeadingLevel(0)).toBe(1);
    expect(normalizeHeadingLevel(9)).toBe(6);
  });

  it('falls back to 1 for non-numeric input', () => {
    expect(normalizeHeadingLevel('1 onmouseover=alert(1)')).toBe(1);
    expect(normalizeHeadingLevel(undefined)).toBe(1);
    expect(normalizeHeadingLevel('2.5')).toBe(1);
  });

  it('accepts numeric strings', () => {
    expect(normalizeHeadingLevel('2')).toBe(2);
  });
});

describe('HTML export', () => {
  it('does not inject markup through a malicious heading level', () => {
    const doc = documentFromJSON({
      blocks: [{ type: 'heading', attrs: { level: '1 onmouseover=alert(1)' }, content: [{ text: 'T' }] }],
    });
    expect(documentToHTML(doc)).toBe('<h1>T</h1>');
  });

  it.each(UNSAFE_HREFS)('drops the link for unsafe href %j', (href) => {
    expect(documentToHTML(linkDoc(href))).toBe('<p>click</p>');
  });

  it('keeps safe links', () => {
    expect(documentToHTML(linkDoc('https://example.com'))).toBe(
      '<p><a href="https://example.com">click</a></p>'
    );
  });
});

describe('Markdown export', () => {
  it('drops unsafe links and clamps heading level', () => {
    expect(documentToMarkdown(linkDoc('javascript:alert(1)'))).toBe('click');
    const doc = documentFromJSON({
      blocks: [{ type: 'heading', attrs: { level: '1 x' }, content: [{ text: 'T' }] }],
    });
    expect(documentToMarkdown(doc)).toBe('# T');
  });
});

describe('Editor view', () => {
  function render(doc: ReturnType<typeof createDocument>) {
    const container = document.createElement('div');
    new DOMReconciler(container).render(EditorState.create({ doc }));
    return container;
  }

  it.each(UNSAFE_HREFS)('does not set href for unsafe href %j', (href) => {
    const a = render(linkDoc(href)).querySelector('a');
    expect(a?.hasAttribute('href') ?? false).toBe(false);
  });

  it('sets href for safe links', () => {
    const a = render(linkDoc('https://example.com')).querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
  });

  it('renders a valid heading for a malicious level', () => {
    const doc = documentFromJSON({
      blocks: [{ type: 'heading', attrs: { level: '1 onmouseover=alert(1)' }, content: [{ text: 'T' }] }],
    });
    const el = render(doc).firstElementChild as HTMLElement;
    expect(el.tagName.toLowerCase()).toBe('h1');
  });
});

describe('Import', () => {
  function linkMarks(doc: ReturnType<typeof createDocument>) {
    return doc.blocks.flatMap((b) => b.content.flatMap((c) => c.marks ?? [])).filter((m) => m.type === 'link');
  }

  it('HTML import drops javascript: links but keeps the text', () => {
    const doc = htmlToDocument('<p><a href="javascript:alert(1)">click</a></p>');
    expect(linkMarks(doc)).toEqual([]);
    expect(doc.blocks[0].content.map((c) => c.text).join('')).toBe('click');
  });

  it('HTML import keeps safe links', () => {
    const doc = htmlToDocument('<p><a href="https://example.com">click</a></p>');
    expect(linkMarks(doc)).toEqual([{ type: 'link', attrs: { href: 'https://example.com' } }]);
  });

  it('Markdown import drops javascript: links but keeps the text', () => {
    const doc = markdownToDocument('[click](javascript:alert(1))');
    expect(linkMarks(doc)).toEqual([]);
    expect(doc.blocks[0].content.map((c) => c.text).join('')).toContain('click');
  });

  it('Markdown import keeps safe links', () => {
    const doc = markdownToDocument('[click](https://example.com)');
    expect(linkMarks(doc)).toEqual([{ type: 'link', attrs: { href: 'https://example.com' } }]);
  });
});
