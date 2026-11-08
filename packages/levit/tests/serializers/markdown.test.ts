import { describe, it, expect } from 'vitest';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';

describe('Markdown Serializer & Deserializer', () => {
  it('serializes headings and paragraphs with marks to markdown', () => {
    const doc = createDocument([
      createBlock('heading', { level: 1 }, [createTextNode('Hello World')]),
      createBlock('paragraph', {}, [
        createTextNode('This is '),
        createTextNode('bold', [{ type: 'bold' }]),
        createTextNode(' and '),
        createTextNode('code', [{ type: 'code' }]),
        createTextNode('.'),
      ]),
      createBlock('blockquote', {}, [createTextNode('Inspiring quote')]),
    ]);

    const md = documentToMarkdown(doc);
    expect(md).toContain('# Hello World\n');
    expect(md).toContain('This is **bold** and `code`.\n');
    expect(md).toContain('> Inspiring quote');
  });

  it('parses markdown text into document blocks and inline marks', () => {
    const md = `# Title\n\nParagraph with **strong** text.\n\n> A quote`;
    const doc = markdownToDocument(md);

    expect(doc.blocks.length).toBe(3);
    expect(doc.blocks[0].type).toBe('heading');
    expect(doc.blocks[0].attrs?.level).toBe(1);
    expect(doc.blocks[0].content[0].text).toBe('Title');

    expect(doc.blocks[1].type).toBe('paragraph');
    expect(doc.blocks[1].content.some((c) => c.marks?.some((m) => m.type === 'bold'))).toBe(true);

    expect(doc.blocks[2].type).toBe('blockquote');
    expect(doc.blocks[2].content[0].text).toBe('A quote');
  });
});


describe('link text with square brackets', () => {
  it('reads balanced and escaped brackets in link text', () => {
    for (const md of ['[a [b] c](https://x.test)', '[a \\[b\\] c](https://x.test)']) {
      const node = markdownToDocument(md).blocks[0].content[0];
      expect(node.text).toBe('a [b] c');
      expect(node.marks).toEqual([{ type: 'link', attrs: { href: 'https://x.test' } }]);
    }
  });

  it('keeps such a link through a Markdown round trip', () => {
    const md = documentToMarkdown(markdownToDocument('[a [b] c](https://x.test)'));
    const node = markdownToDocument(md).blocks[0].content[0];
    expect(node.text).toBe('a [b] c');
    expect(node.marks?.[0]?.type).toBe('link');
  });
});
