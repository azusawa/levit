import { describe, it, expect } from 'vitest';
import { createDocument, createBlock, createTextNode } from '../../src/core/model/document';
import { documentToJSON, documentFromJSON } from '../../src/serializers/json';
import { EditorState } from '../../src/core/state/state';

describe('JSON Serialization & Deserialization', () => {
  it('serializes a document to a clean JSON structure', () => {
    const doc = createDocument([
      createBlock('heading', { level: 1 }, [createTextNode('Title')], 'b1'),
      createBlock('paragraph', {}, [
        createTextNode('Hello '),
        createTextNode('World', [{ type: 'bold' }]),
      ], 'b2'),
    ]);

    const json = documentToJSON(doc);
    expect(json.version).toBe(1);
    expect(json.blocks.length).toBe(2);
    expect(json.blocks[0].type).toBe('heading');
    expect(json.blocks[0].attrs).toEqual({ level: 1 });
    expect(json.blocks[1].content[1].marks).toEqual([{ type: 'bold' }]);
  });

  it('deserializes JSON back to a valid DocumentData', () => {
    const raw = {
      version: 1,
      blocks: [
        {
          id: 'test-1',
          type: 'heading',
          attrs: { level: 2 },
          content: [{ text: 'Section 1', marks: [] }],
        },
      ],
    };

    const doc = documentFromJSON(raw);
    expect(doc.version).toBe(1);
    expect(doc.blocks[0].id).toBe('test-1');
    expect(doc.blocks[0].type).toBe('heading');
    expect(doc.blocks[0].content[0].text).toBe('Section 1');
  });

  it('handles empty or malformed JSON gracefully', () => {
    const emptyDoc = documentFromJSON(null as any);
    expect(emptyDoc.blocks.length).toBe(1);
    expect(emptyDoc.blocks[0].type).toBe('paragraph');
  });
});

