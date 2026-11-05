import { describe, it, expect } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { createBlock, createTextNode, getBlockText } from '../../src/core/model/document';

describe('EditorState & Transaction Engine', () => {
  it('initializes with a default document and collapsed selection at start', () => {
    const state = EditorState.create();
    expect(state.doc.blocks.length).toBe(1);
    expect(state.selection.isCollapsed).toBe(true);
    expect(state.selection.anchor.blockId).toBe(state.doc.blocks[0].id);
    expect(state.selection.anchor.offset).toBe(0);
  });

  it('inserts text at cursor and advances selection', () => {
    let state = EditorState.create();
    state = state.tr.insertText('Hello').apply();
    
    expect(getBlockText(state.doc.blocks[0])).toBe('Hello');
    expect(state.selection.anchor.offset).toBe(5);
    expect(state.selection.head.offset).toBe(5);

    state = state.tr.insertText(' World').apply();
    expect(getBlockText(state.doc.blocks[0])).toBe('Hello World');
    expect(state.selection.anchor.offset).toBe(11);
  });

  it('splits block on enter (splitBlock)', () => {
    let state = EditorState.create();
    state = state.tr.insertText('FirstLine').apply();
    // Move selection to offset 5 ('First')
    state = state.setSelection({
      anchor: { blockId: state.doc.blocks[0].id, offset: 5 },
      head: { blockId: state.doc.blocks[0].id, offset: 5 },
      isCollapsed: true,
    });
    state = state.tr.splitBlock().apply();

    expect(state.doc.blocks.length).toBe(2);
    expect(getBlockText(state.doc.blocks[0])).toBe('First');
    expect(getBlockText(state.doc.blocks[1])).toBe('Line');
    expect(state.selection.anchor.blockId).toBe(state.doc.blocks[1].id);
    expect(state.selection.anchor.offset).toBe(0);
  });

  it('merges with previous block on backspace at offset 0 (mergeBlock)', () => {
    let state = EditorState.create();
    state = state.tr.insertText('First').apply();
    state = state.tr.splitBlock().apply();
    state = state.tr.insertText('Second').apply();

    expect(state.doc.blocks.length).toBe(2);

    // Place cursor at beginning of second block
    state = state.setSelection({
      anchor: { blockId: state.doc.blocks[1].id, offset: 0 },
      head: { blockId: state.doc.blocks[1].id, offset: 0 },
      isCollapsed: true,
    });

    state = state.tr.deleteBackward().apply();

    expect(state.doc.blocks.length).toBe(1);
    expect(getBlockText(state.doc.blocks[0])).toBe('FirstSecond');
    // Selection should be at merge boundary (offset 5)
    expect(state.selection.anchor.blockId).toBe(state.doc.blocks[0].id);
    expect(state.selection.anchor.offset).toBe(5);
  });

  it('deletes backward a single character in middle of block', () => {
    let state = EditorState.create();
    state = state.tr.insertText('Hello').apply();
    state = state.tr.deleteBackward().apply();
    expect(getBlockText(state.doc.blocks[0])).toBe('Hell');
    expect(state.selection.anchor.offset).toBe(4);
  });

  it('replaces range selection when typing new text', () => {
    let state = EditorState.create();
    state = state.tr.insertText('Hello Amazing World').apply();
    const blockId = state.doc.blocks[0].id;
    // Select 'Amazing ' (from offset 6 to 14)
    state = state.setSelection({
      anchor: { blockId, offset: 6 },
      head: { blockId, offset: 14 },
      isCollapsed: false,
    });
    state = state.tr.insertText('Beautiful ').apply();

    expect(getBlockText(state.doc.blocks[0])).toBe('Hello Beautiful World');
    expect(state.selection.anchor.offset).toBe(16);
    expect(state.selection.isCollapsed).toBe(true);
  });

  it('toggles mark on selected text range', () => {
    let state = EditorState.create();
    state = state.tr.insertText('Hello World').apply();
    const blockId = state.doc.blocks[0].id;
    // Select 'World' (offset 6 to 11)
    state = state.setSelection({
      anchor: { blockId, offset: 6 },
      head: { blockId, offset: 11 },
      isCollapsed: false,
    });

    // Toggle bold ON
    state = state.tr.toggleMark({ type: 'bold' }).apply();
    expect(state.doc.blocks[0].content).toEqual([
      { text: 'Hello ', marks: [] },
      { text: 'World', marks: [{ type: 'bold' }] },
    ]);

    // Toggle bold OFF
    state = state.tr.toggleMark({ type: 'bold' }).apply();
    expect(getBlockText(state.doc.blocks[0])).toBe('Hello World');
    expect(state.doc.blocks[0].content[0].marks).toEqual([]);
  });

  it('changes block type (e.g. paragraph -> heading)', () => {
    let state = EditorState.create();
    state = state.tr.insertText('My Header').apply();
    state = state.tr.setBlockType('heading', { level: 2 }).apply();

    expect(state.doc.blocks[0].type).toBe('heading');
    expect(state.doc.blocks[0].attrs).toEqual({ level: 2 });
    expect(getBlockText(state.doc.blocks[0])).toBe('My Header');
  });

  it('supports undo and redo', () => {
    let state = EditorState.create();
    state = state.tr.insertText('First').apply();
    state = state.tr.insertText(' Second').apply();

    expect(getBlockText(state.doc.blocks[0])).toBe('First Second');

    state = state.undo();
    expect(getBlockText(state.doc.blocks[0])).toBe('First');

    state = state.undo();
    expect(getBlockText(state.doc.blocks[0])).toBe('');

    state = state.redo();
    expect(getBlockText(state.doc.blocks[0])).toBe('First');

    state = state.redo();
    expect(getBlockText(state.doc.blocks[0])).toBe('First Second');
  });
});

