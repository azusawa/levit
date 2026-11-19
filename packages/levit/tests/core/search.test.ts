import { describe, it, expect } from 'vitest';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { findMatches, replaceMatches } from '../../src/core/model/search';
import { EditorState } from '../../src/core/state/state';
import type { DocumentData, InlineNode } from '../../src/core/model/types';

const para = (id: string, ...nodes: InlineNode[]) => createBlock('paragraph', {}, nodes, id);
const text = (t: string) => createTextNode(t);
const bold = (t: string) => createTextNode(t, [{ type: 'bold' }]);
const doc = (...blocks: ReturnType<typeof para>[]): DocumentData => ({ version: 1, blocks });

describe('findMatches', () => {
  it('finds every place the text is, in document order', () => {
    const d = doc(para('a', text('cat and cat')), para('b', text('a cat')));
    expect(findMatches(d, 'cat')).toEqual([
      { blockId: 'a', from: 0, to: 3, text: 'cat' },
      { blockId: 'a', from: 8, to: 11, text: 'cat' },
      { blockId: 'b', from: 2, to: 5, text: 'cat' },
    ]);
  });

  it('finds nothing for an empty query', () => {
    expect(findMatches(doc(para('a', text('abc'))), '')).toEqual([]);
  });

  it('ignores case unless asked not to', () => {
    const d = doc(para('a', text('Cat cat CAT')));
    expect(findMatches(d, 'cat')).toHaveLength(3);
    expect(findMatches(d, 'cat', { caseSensitive: true })).toEqual([{ blockId: 'a', from: 4, to: 7, text: 'cat' }]);
    // The match holds the text as it is in the document.
    expect(findMatches(d, 'cat')[2].text).toBe('CAT');
  });

  it('keeps offsets right for letters whose lower case is longer', () => {
    // "İ".toLowerCase() is two characters; the offsets must still be the text's.
    const d = doc(para('a', text('İx x')));
    expect(findMatches(d, 'x')).toEqual([
      { blockId: 'a', from: 1, to: 2, text: 'x' },
      { blockId: 'a', from: 3, to: 4, text: 'x' },
    ]);
  });

  it('finds text across marks', () => {
    const d = doc(para('a', text('hel'), bold('lo'), text(' world')));
    expect(findMatches(d, 'hello')).toEqual([{ blockId: 'a', from: 0, to: 5, text: 'hello' }]);
  });

  it('does not count overlapping matches twice', () => {
    expect(findMatches(doc(para('a', text('aaaa'))), 'aa')).toEqual([
      { blockId: 'a', from: 0, to: 2, text: 'aa' },
      { blockId: 'a', from: 2, to: 4, text: 'aa' },
    ]);
  });

  it('does not match across blocks', () => {
    expect(findMatches(doc(para('a', text('ab')), para('b', text('cd'))), 'bc')).toEqual([]);
  });

  it('matches a Greek final sigma with any sigma when ignoring case', () => {
    expect(findMatches(doc(para('a', text('ΟΔΟΣ'))), 'οδος')).toHaveLength(1);
    expect(findMatches(doc(para('a', text('οδος'))), 'ΟΔΟΣ')).toHaveLength(1);
  });

  it('finds Korean text', () => {
    expect(findMatches(doc(para('a', text('안녕하세요, 안녕'))), '안녕')).toHaveLength(2);
  });
});

describe('replaceMatches', () => {
  const stateOf = (d: DocumentData) => EditorState.create({ doc: d });

  it('replaces the matches in one change', () => {
    const state = stateOf(doc(para('a', text('cat and cat')), para('b', text('a cat'))));
    const tr = state.tr;
    expect(replaceMatches(tr, findMatches(state.doc, 'cat'), 'dog')).toBe(3);
    const next = tr.apply();
    expect(next.doc.blocks.map((b) => b.content.map((n) => n.text).join(''))).toEqual(['dog and dog', 'a dog']);
  });

  it('gives the new text the marks of the first replaced letter', () => {
    const state = stateOf(doc(para('a', text('say '), bold('hi'), text('!'))));
    const tr = state.tr;
    replaceMatches(tr, findMatches(state.doc, 'hi'), 'hello');
    expect(tr.apply().doc.blocks[0].content).toEqual([text('say '), bold('hello'), text('!')]);
  });

  it('removes the matches when the new text is empty', () => {
    const state = stateOf(doc(para('a', text('a-b-c'))));
    const tr = state.tr;
    replaceMatches(tr, findMatches(state.doc, '-'), '');
    expect(tr.apply().doc.blocks[0].content).toEqual([text('abc')]);
  });

  it('puts the caret after the last replaced text', () => {
    const state = stateOf(doc(para('a', text('x y x'))));
    const tr = state.tr;
    replaceMatches(tr, findMatches(state.doc, 'x'), 'zz');
    // 'zz y zz': after the second 'zz'.
    expect(tr.apply().selection.head).toEqual({ blockId: 'a', offset: 7 });
  });

  it('puts the caret after the last replaced text when earlier ones in its block change length', () => {
    const state = stateOf(doc(para('a', text('a a a'))));
    const tr = state.tr;
    replaceMatches(tr, findMatches(state.doc, 'a'), 'bbb');
    const next = tr.apply();
    expect(next.doc.blocks[0].content).toEqual([text('bbb bbb bbb')]);
    expect(next.selection.head).toEqual({ blockId: 'a', offset: 11 });
  });

  it('replaces a place once when matches repeat or overlap', () => {
    const state = stateOf(doc(para('a', text('abcdef'))));
    const tr = state.tr;
    const abc = { blockId: 'a', from: 0, to: 3, text: 'abc' };
    const cde = { blockId: 'a', from: 2, to: 5, text: 'cde' };
    expect(replaceMatches(tr, [abc, abc, cde], 'X')).toBe(1);
    expect(tr.apply().doc.blocks[0].content).toEqual([text('Xdef')]);
  });

  it('changes nothing without matches', () => {
    const state = stateOf(doc(para('a', text('abc'))));
    const tr = state.tr;
    expect(replaceMatches(tr, [], 'x')).toBe(0);
    expect(tr.docChanged).toBe(false);
  });

  it('skips matches whose text has changed since they were found', () => {
    const state = stateOf(doc(para('a', text('abc'))));
    const tr = state.tr;
    const stale = [
      { blockId: 'a', from: 0, to: 9, text: 'abcdefghi' },
      { blockId: 'gone', from: 0, to: 1, text: 'a' },
      // Fits, but the text there is not the text that was found.
      { blockId: 'a', from: 1, to: 3, text: 'ab' },
    ];
    expect(replaceMatches(tr, stale, 'x')).toBe(0);
    expect(tr.docChanged).toBe(false);
  });
});
