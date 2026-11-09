import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';

let editor: LevitEditor;
let container: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  editor = new LevitEditor({
    element: container,
    initialContent: createDocument([
      createBlock('paragraph', {}, [createTextNode('one')], 'a'),
      createBlock('paragraph', {}, [createTextNode('two')], 'b'),
    ]),
  });
});

const caret = (blockId: string, offset: number) => ({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true });
const texts = () => editor.state.doc.blocks.map((b) => getBlockText(b));

describe('transaction meta', () => {
  it('carries values for listeners, like where a change came from', () => {
    const seen: unknown[] = [];
    editor.on('transaction', ({ transaction }) => seen.push(transaction.getMeta('origin')));
    const tr = editor.state.tr.setMeta('origin', 'remote');
    expect(tr.getMeta('origin')).toBe('remote');
    editor.dispatch(tr.insertText('!'));
    expect(seen).toEqual(['remote']);
  });

  it('addToHistory: false keeps a change out of undo', () => {
    editor.dispatch(editor.state.tr.setSelection(caret('a', 3)).insertText('1'));
    editor.dispatch(editor.state.tr.setSelection(caret('b', 3)).insertText('2').setMeta('addToHistory', false));
    expect(texts()).toEqual(['one1', 'two2']);
    // One undo step (the first change) and no more.
    editor.undo();
    expect(editor.state.history.canUndo()).toBe(false);
  });
});

describe('tr.setBlocks', () => {
  it('replaces the blocks, keeping unchanged ones as they are', () => {
    const [a] = editor.state.doc.blocks;
    const b2 = createBlock('heading', { level: 2 }, [createTextNode('new')], 'b');
    editor.dispatch(editor.state.tr.setBlocks([a, b2]));
    expect(editor.state.doc.blocks[0]).toBe(a);
    expect(editor.state.doc.blocks[1]).toMatchObject({ type: 'heading', id: 'b' });
    expect(container.querySelector('h2')!.textContent).toBe('new');
  });

  it('never leaves the document empty, and keeps the caret in a block that exists', () => {
    editor.dispatch(editor.state.tr.setSelection(caret('b', 2)));
    editor.dispatch(editor.state.tr.setBlocks([createBlock('paragraph', {}, [createTextNode('x')], 'c')]));
    expect(editor.state.doc.blocks).toHaveLength(1);
    expect(editor.state.selection.anchor.blockId).toBe('c');
    editor.dispatch(editor.state.tr.setBlocks([]));
    expect(editor.state.doc.blocks).toHaveLength(1);
  });
});

describe('editor.setHistory', () => {
  it('sends undo and redo (also the keys) to another history, like a shared one', () => {
    const undo = vi.fn(() => true);
    const redo = vi.fn(() => true);
    editor.setHistory({ undo, redo });
    editor.dispatch(editor.state.tr.setSelection(caret('a', 3)).insertText('!'));
    expect(editor.state.history.canUndo()).toBe(false);
    expect(editor.undo()).toBe(true);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', shiftKey: true, ctrlKey: true, metaKey: true, bubbles: true, cancelable: true }));
    expect(undo).toHaveBeenCalledTimes(2);
    expect(redo).toHaveBeenCalledTimes(1);
    expect(texts()).toEqual(['one!', 'two']);

    editor.setHistory(null);
    editor.dispatch(editor.state.tr.insertText('?'));
    editor.undo();
    expect(texts()).toEqual(['one!', 'two']);
  });
});

describe('changes from others', () => {
  it('do not move the page selection or focus when the editor is not focused', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const b = createBlock('paragraph', {}, [createTextNode('two, edited elsewhere')], 'b');
    const tr = editor.state.tr.setBlocks([editor.state.doc.blocks[0], b]).setMeta('remote', true).setMeta('addToHistory', false);
    editor.dispatch(tr);
    expect(document.activeElement).toBe(input);
    expect(texts()).toEqual(['one', 'two, edited elsewhere']);
  });

  it('isComposing tells whether IME composition is going on', () => {
    expect(editor.isComposing).toBe(false);
    container.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(editor.isComposing).toBe(true);
  });
});
