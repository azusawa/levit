import { describe, it, expect } from 'vitest';
import {
  createDocument,
  createBlock,
  createTextNode,
  getBlockText,
  findBlockIndex,
  splitBlockContent,
  mergeBlockContent,
} from '../../src/core/model/document';

describe('Document Model', () => {
  it('creates an empty document with default paragraph', () => {
    const doc = createDocument();
    expect(doc.blocks.length).toBe(1);
    expect(doc.blocks[0].type).toBe('paragraph');
    expect(doc.blocks[0].content.length).toBe(1);
    expect(doc.blocks[0].content[0].text).toBe('');
  });

  it('calculates full text of a block with multiple inline nodes', () => {
    const block = createBlock('paragraph', {}, [
      createTextNode('Hello '),
      createTextNode('World', [{ type: 'bold' }]),
      createTextNode('!'),
    ]);
    expect(getBlockText(block)).toBe('Hello World!');
  });

  it('splits block content at specified offset', () => {
    const block = createBlock('paragraph', {}, [
      createTextNode('Hello '),
      createTextNode('World', [{ type: 'bold' }]),
    ]);
    // 'Hello World' has length 11. Offset 6 is right before 'World'.
    const [left, right] = splitBlockContent(block, 6);
    expect(getBlockText({ ...block, content: left })).toBe('Hello ');
    expect(getBlockText({ ...block, content: right })).toBe('World');
    expect(right[0].marks).toEqual([{ type: 'bold' }]);
  });

  it('splits inside an inline node preserving marks correctly', () => {
    const block = createBlock('paragraph', {}, [
      createTextNode('Hello', [{ type: 'italic' }]),
    ]);
    // Split at offset 2 -> 'He' and 'llo'
    const [left, right] = splitBlockContent(block, 2);
    expect(left).toEqual([{ text: 'He', marks: [{ type: 'italic' }] }]);
    expect(right).toEqual([{ text: 'llo', marks: [{ type: 'italic' }] }]);
  });

  it('merges content from two blocks properly combining adjacent identical marks', () => {
    const b1 = createBlock('paragraph', {}, [
      createTextNode('Alpha', [{ type: 'bold' }]),
    ]);
    const b2 = createBlock('paragraph', {}, [
      createTextNode('Beta', [{ type: 'bold' }]),
      createTextNode(' Gamma'),
    ]);
    const merged = mergeBlockContent(b1.content, b2.content);
    expect(merged.length).toBe(2);
    expect(merged[0]).toEqual({ text: 'AlphaBeta', marks: [{ type: 'bold' }] });
    expect(merged[1]).toEqual({ text: ' Gamma', marks: [] });
  });

  it('finds block index by id', () => {
    const doc = createDocument([
      createBlock('paragraph', {}, [createTextNode('First')], 'id-1'),
      createBlock('paragraph', {}, [createTextNode('Second')], 'id-2'),
    ]);
    expect(findBlockIndex(doc, 'id-1')).toBe(0);
    expect(findBlockIndex(doc, 'id-2')).toBe(1);
    expect(findBlockIndex(doc, 'non-existent')).toBe(-1);
  });
});

