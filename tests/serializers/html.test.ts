import { describe, it, expect } from 'vitest';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';

describe('HTML Serializer & Deserializer', () => {
  it('serializes document to clean semantic HTML', () => {
    const doc = createDocument([
      createBlock('heading', { level: 2 }, [createTextNode('Section')]),
      createBlock('paragraph', {}, [
        createTextNode('Nice '),
        createTextNode('bold', [{ type: 'bold' }]),
      ]),
    ]);

    const html = documentToHTML(doc);
    expect(html).toBe('<h2>Section</h2><p>Nice <strong>bold</strong></p>');
  });

  it('parses HTML string to document structure', () => {
    const html = '<h1>Heading</h1><p>Text with <em>italic</em></p><blockquote>Quote</blockquote>';
    const doc = htmlToDocument(html);

    expect(doc.blocks.length).toBe(3);
    expect(doc.blocks[0].type).toBe('heading');
    expect(doc.blocks[0].attrs?.level).toBe(1);
    expect(doc.blocks[1].type).toBe('paragraph');
    expect(doc.blocks[1].content.some((c) => c.marks?.some((m) => m.type === 'italic'))).toBe(true);
    expect(doc.blocks[2].type).toBe('blockquote');
  });
});

