import { describe, it, expect } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import type { BlockNode, DocumentData } from '../../src/core/model/types';

function caret(blockId: string, offset: number) {
  return { anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true };
}

function range(fromId: string, from: number, toId: string, to: number) {
  return { anchor: { blockId: fromId, offset: from }, head: { blockId: toId, offset: to }, isCollapsed: false };
}

function stateWith(blocks: BlockNode[], sel = caret(blocks[0].id, 0)) {
  const state = EditorState.create({ doc: createDocument(blocks) });
  return state.tr.setSelection(sel).apply();
}

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const texts = (doc: DocumentData) => doc.blocks.map((b) => getBlockText(b));
const summary = (doc: DocumentData) => doc.blocks.map((b) => [b.type, getBlockText(b)]);
const at = (state: EditorState) => state.selection.anchor;

describe('deleteForward', () => {
  it('deletes the character after the caret', () => {
    let state = stateWith([para('a', 'abc')], caret('a', 1));
    state = state.tr.deleteForward().apply();
    expect(texts(state.doc)).toEqual(['ac']);
    expect(at(state)).toEqual({ blockId: 'a', offset: 1 });
  });

  it('at the end of a block pulls the next block up', () => {
    let state = stateWith([para('a', 'one'), para('b', 'two')], caret('a', 3));
    state = state.tr.deleteForward().apply();
    expect(texts(state.doc)).toEqual(['onetwo']);
    expect(at(state)).toEqual({ blockId: 'a', offset: 3 });
  });

  it('does nothing at the end of the last block', () => {
    const state = stateWith([para('a', 'end')], caret('a', 3));
    expect(state.tr.deleteForward().docChanged).toBe(false);
  });

  it('deletes the selection when there is one', () => {
    let state = stateWith([para('a', 'abcdef')], range('a', 1, 'a', 4));
    state = state.tr.deleteForward().apply();
    expect(texts(state.doc)).toEqual(['aef']);
  });
});

describe('characters made of several code units', () => {
  it.each([
    ['emoji', 'a😀b', 3, 'ab', 1],
    ['flag', 'a🇰🇷b', 5, 'ab', 1],
    ['family emoji', 'x👨‍👩‍👧y', 9, 'xy', 1],
    ['combining mark', 'aéz', 3, 'az', 1],
  ])('Backspace removes a whole %s', (_name, text, offset, expected, caretAfter) => {
    let state = stateWith([para('a', text)], caret('a', offset));
    state = state.tr.deleteBackward().apply();
    expect(texts(state.doc)).toEqual([expected]);
    expect(at(state).offset).toBe(caretAfter);
  });

  it('Delete removes a whole emoji', () => {
    let state = stateWith([para('a', 'a😀b')], caret('a', 1));
    state = state.tr.deleteForward().apply();
    expect(texts(state.doc)).toEqual(['ab']);
  });
});

describe('word deletion', () => {
  it('deleteWordBackward removes the previous word and the spaces after it', () => {
    let state = stateWith([para('a', 'hello big world')], caret('a', 10));
    state = state.tr.deleteWordBackward().apply();
    expect(texts(state.doc)).toEqual(['hello world']);
    expect(at(state).offset).toBe(6);
  });

  it('deleteWordBackward works with Korean words', () => {
    let state = stateWith([para('a', '안녕하세요 세계')], caret('a', 8));
    state = state.tr.deleteWordBackward().apply();
    expect(texts(state.doc)).toEqual(['안녕하세요 ']);
  });

  it('deleteWordForward removes the next word and the spaces before it', () => {
    let state = stateWith([para('a', 'hello big world')], caret('a', 5));
    state = state.tr.deleteWordForward().apply();
    expect(texts(state.doc)).toEqual(['hello world']);
    expect(at(state).offset).toBe(5);
  });

  it('at a block edge behaves like a single Backspace / Delete', () => {
    let state = stateWith([para('a', 'one'), para('b', 'two')], caret('b', 0));
    state = state.tr.deleteWordBackward().apply();
    expect(texts(state.doc)).toEqual(['onetwo']);

    state = stateWith([para('a', 'one'), para('b', 'two')], caret('a', 3));
    state = state.tr.deleteWordForward().apply();
    expect(texts(state.doc)).toEqual(['onetwo']);
  });
});

describe('line deletion', () => {
  it('deleteLineBackward removes text back to the start of the line', () => {
    let state = stateWith([para('a', 'first\nsecond line')], caret('a', 13));
    state = state.tr.deleteLineBackward().apply();
    expect(texts(state.doc)).toEqual(['first\nline']);
    expect(at(state).offset).toBe(6);
  });

  it('deleteLineForward removes text up to the end of the line', () => {
    let state = stateWith([para('a', 'keep cut\nnext')], caret('a', 4));
    state = state.tr.deleteLineForward().apply();
    expect(texts(state.doc)).toEqual(['keep\nnext']);
  });

  it('at the start of a block merges like Backspace', () => {
    let state = stateWith([para('a', 'one'), para('b', 'two')], caret('b', 0));
    state = state.tr.deleteLineBackward().apply();
    expect(texts(state.doc)).toEqual(['onetwo']);
  });
});

describe('insertLineBreak', () => {
  it('inserts a newline inside the block instead of a new block', () => {
    let state = stateWith([para('a', 'ab')], caret('a', 1));
    state = state.tr.insertLineBreak().apply();
    expect(texts(state.doc)).toEqual(['a\nb']);
    expect(at(state)).toEqual({ blockId: 'a', offset: 2 });
  });

  it('replaces a selection', () => {
    let state = stateWith([para('a', 'abc')], range('a', 1, 'a', 2));
    state = state.tr.insertLineBreak().apply();
    expect(texts(state.doc)).toEqual(['a\nc']);
  });
});

describe('insertFragment', () => {
  const fragment = () => [
    createBlock('heading', { level: 2 }, [createTextNode('Title')]),
    createBlock('paragraph', {}, [createTextNode('middle')]),
    createBlock('bullet_list_item', {}, [createTextNode('last')]),
  ];

  it('one block inserts its inline content and keeps the marks', () => {
    let state = stateWith([para('a', 'ab')], caret('a', 1));
    const piece = createBlock('paragraph', {}, [createTextNode('X', [{ type: 'bold' }])]);
    state = state.tr.insertFragment([piece]).apply();
    expect(state.doc.blocks[0].content).toEqual([
      { text: 'a', marks: [] },
      { text: 'X', marks: [{ type: 'bold' }] },
      { text: 'b', marks: [] },
    ]);
    expect(at(state)).toEqual({ blockId: 'a', offset: 2 });
  });

  it('several blocks split the current block around them', () => {
    let state = stateWith([para('a', 'startEND')], caret('a', 5));
    state = state.tr.insertFragment(fragment()).apply();
    expect(summary(state.doc)).toEqual([
      ['paragraph', 'startTitle'],
      ['paragraph', 'middle'],
      ['bullet_list_item', 'lastEND'],
    ]);
    const last = state.doc.blocks[2];
    expect(at(state)).toEqual({ blockId: last.id, offset: 4 });
  });

  it('into an empty paragraph, the first block keeps its own type', () => {
    let state = stateWith([para('a', '')], caret('a', 0));
    state = state.tr.insertFragment(fragment()).apply();
    expect(summary(state.doc)).toEqual([
      ['heading', 'Title'],
      ['paragraph', 'middle'],
      ['bullet_list_item', 'last'],
    ]);
    expect(state.doc.blocks[0].attrs).toEqual({ level: 2 });
  });

  it('gives inserted blocks fresh ids', () => {
    const piece = [para('dup', 'x'), para('dup', 'y')];
    let state = stateWith([para('a', '')], caret('a', 0));
    state = state.tr.insertFragment(piece).apply();
    const ids = state.doc.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('replaces the selection first', () => {
    let state = stateWith([para('a', 'one'), para('b', 'two')], range('a', 1, 'b', 2));
    state = state.tr.insertFragment([para('p', 'X')]).apply();
    expect(texts(state.doc)).toEqual(['oXo']);
  });

  it('does nothing with an empty fragment', () => {
    const state = stateWith([para('a', 'x')]);
    expect(state.tr.insertFragment([]).docChanged).toBe(false);
  });
});

describe('insertFragment with one block', () => {
  const heading = () => createBlock('heading', { level: 2 }, [createTextNode('Title')]);

  it('an empty paragraph takes the type of the block, like with several blocks', () => {
    let state = stateWith([para('a', '')]);
    state = state.tr.insertFragment([heading()]).apply();
    expect(state.doc.blocks.map((b) => [b.type, b.attrs])).toEqual([['heading', { level: 2 }]]);
  });

  it('into text, only the text of the block goes in', () => {
    let state = stateWith([para('a', 'ab')], caret('a', 1));
    state = state.tr.insertFragment([heading()]).apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'aTitleb']]);
  });
});
