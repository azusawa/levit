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


describe('sameContent', () => {
  it('compares documents without their block ids', async () => {
    const { sameContent } = await import('../../src/serializers/json');
    const a = { version: 1, blocks: [{ id: 'x', type: 'paragraph', content: [{ text: 'hi' }] }] };
    const b = { version: 1, blocks: [{ id: 'y', type: 'paragraph', attrs: {}, content: [{ text: 'hi', marks: [] }] }] };
    const c = { version: 1, blocks: [{ id: 'x', type: 'paragraph', content: [{ text: 'bye' }] }] };
    expect(sameContent(a, b)).toBe(true);
    expect(sameContent(a, c)).toBe(false);
  });
});

describe('built-in block types', () => {
  it('are listed once and used by the plugin check and both serializers', async () => {
    const { BUILT_IN_BLOCK_TYPES } = await import('../../src/core/model/document');
    const { Schema } = await import('../../src/core/plugin/plugin');
    for (const type of BUILT_IN_BLOCK_TYPES) {
      expect(() => new Schema([{ name: 'x', blocks: [{ type }] }])).toThrow(/built in/);
    }
  });
});
