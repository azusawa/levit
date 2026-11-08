import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';

let editor: LevitEditor;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  editor = new LevitEditor({
    element: container,
    initialContent: createDocument([createBlock('paragraph', {}, [createTextNode('hello')], 'p')]),
  });
});

const caret = (offset: number) => ({
  anchor: { blockId: 'p', offset },
  head: { blockId: 'p', offset },
  isCollapsed: true,
});

describe('editor events', () => {
  it('"update" fires when the document changes, with the editor', () => {
    const update = vi.fn();
    editor.on('update', update);
    editor.chain().insertText('!').run();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].editor).toBe(editor);
  });

  it('"update" does not fire for a selection-only change; "selectionUpdate" does', () => {
    const update = vi.fn();
    const selection = vi.fn();
    editor.on('update', update);
    editor.on('selectionUpdate', selection);
    editor.dispatch(editor.state.tr.setSelection(caret(2)));
    expect(update).not.toHaveBeenCalled();
    expect(selection).toHaveBeenCalledTimes(1);
    expect(selection.mock.calls[0][0].selection.anchor).toEqual({ blockId: 'p', offset: 2 });
  });

  it('"transaction" fires for every dispatch', () => {
    const tr = vi.fn();
    editor.on('transaction', tr);
    editor.dispatch(editor.state.tr.setSelection(caret(1)));
    editor.chain().insertText('x').run();
    expect(tr).toHaveBeenCalledTimes(2);
    expect(tr.mock.calls[1][0].transaction.docChanged).toBe(true);
  });

  it('undo, redo and setJSON fire "update"', () => {
    const update = vi.fn();
    editor.chain().insertText('x').run();
    editor.on('update', update);
    editor.undo();
    editor.redo();
    editor.setJSON({ version: 1, blocks: [{ type: 'paragraph', content: [{ text: 'new' }] }] });
    expect(update).toHaveBeenCalledTimes(3);
  });

  it('"focus" and "blur" follow the editor element', () => {
    const focus = vi.fn();
    const blur = vi.fn();
    editor.on('focus', focus);
    editor.on('blur', blur);
    container.dispatchEvent(new FocusEvent('focus'));
    container.dispatchEvent(new FocusEvent('blur'));
    expect(focus).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('"destroy" fires once, and handlers are dropped afterwards', () => {
    const destroy = vi.fn();
    const update = vi.fn();
    editor.on('destroy', destroy);
    editor.on('update', update);
    editor.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    editor.chain().insertText('x').run();
    expect(update).not.toHaveBeenCalled();
  });

  it('on() returns a function that removes the handler, and off() does too', () => {
    const a = vi.fn();
    const b = vi.fn();
    const stop = editor.on('update', a);
    editor.on('update', b);
    stop();
    editor.off('update', b);
    editor.chain().insertText('x').run();
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('a handler that throws does not stop the others; the error goes to onError', () => {
    const onError = vi.fn();
    const el = document.createElement('div');
    const ed = new LevitEditor({ element: el, onError });
    const after = vi.fn();
    ed.on('update', () => {
      throw new Error('boom');
    });
    ed.on('update', after);
    ed.chain().insertText('x').run();
    expect(after).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });
});

describe('review fixes', () => {
  it('setJSON also fires "selectionUpdate", since the selection moves to the new document', () => {
    const selection = vi.fn();
    editor.on('selectionUpdate', selection);
    editor.setJSON({ version: 1, blocks: [{ id: 'n', type: 'paragraph', content: [{ text: 'new' }] }] });
    expect(selection).toHaveBeenCalledTimes(1);
    expect(selection.mock.calls[0][0].selection.anchor.blockId).toBe('n');
  });
});
