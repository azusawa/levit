import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { createCell } from '../../src/core/model/table';
import type { BlockNode } from '../../src/core/model/types';

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const bullet = (id: string, text: string, indent = 0) =>
  createBlock('bullet_list_item', indent ? { indent } : {}, [createTextNode(text)], id);
const cell = (id: string, text: string, table: string, row: string) => ({ ...createCell(table, row), id, content: [createTextNode(text)] });
/** A table with id `t` and two rows of two cells, t1 to t4. */
const table = (t = 't') => [
  cell(`${t}1`, 'A', t, `${t}r1`),
  cell(`${t}2`, 'B', t, `${t}r1`),
  cell(`${t}3`, 'C', t, `${t}r2`),
  cell(`${t}4`, 'D', t, `${t}r2`),
];
const caret = (blockId: string, offset = 0) => ({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true });
const range = (from: string, to: string) => ({
  anchor: { blockId: from, offset: 0 },
  head: { blockId: to, offset: 1 },
  isCollapsed: false,
});

let element: HTMLElement;
let editor: LevitEditor;

function make(blocks: BlockNode[]) {
  editor = new LevitEditor({ element, initialContent: createDocument(blocks) });
  editor.focus();
}
const put = (blockId: string, offset = 0) => editor.dispatch(editor.state.tr.setSelection(caret(blockId, offset)));
const ids = () => editor.state.doc.blocks.map((b) => b.id);
const texts = () => editor.state.doc.blocks.map((b) => getBlockText(b));
function key(name: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  editor?.destroy();
  element.remove();
});

describe('moveBlocksUp and moveBlocksDown', () => {
  it('swap the block with the caret and the one above or below, keeping the caret', () => {
    make([para('a', 'one'), para('b', 'two'), para('c', 'three')]);
    put('b', 2);
    editor.chain().moveBlocksUp().run();
    expect(ids()).toEqual(['b', 'a', 'c']);
    expect(editor.state.selection).toEqual(caret('b', 2));
    editor.chain().moveBlocksDown().run();
    editor.chain().moveBlocksDown().run();
    expect(ids()).toEqual(['a', 'c', 'b']);
    // Each move is one undo step, and the moved block keeps its content.
    editor.undo();
    expect(ids()).toEqual(['a', 'b', 'c']);
    expect(texts()).toEqual(['one', 'two', 'three']);
  });

  it('do nothing at the top or the bottom of the document', () => {
    make([para('a', 'one'), para('b', 'two')]);
    const before = editor.state.doc;
    put('a');
    editor.chain().moveBlocksUp().run();
    put('b');
    editor.chain().moveBlocksDown().run();
    expect(editor.state.doc.blocks).toEqual(before.blocks);
    // Nothing changed, so there is nothing to undo.
    expect(editor.undo()).toBe(false);
  });

  it('move all selected blocks together', () => {
    make([para('a', 'one'), para('b', 'two'), para('c', 'three'), para('d', 'four')]);
    editor.dispatch(editor.state.tr.setSelection(range('b', 'c')));
    editor.chain().moveBlocksUp().run();
    expect(ids()).toEqual(['b', 'c', 'a', 'd']);
    editor.chain().moveBlocksDown().run();
    editor.chain().moveBlocksDown().run();
    expect(ids()).toEqual(['a', 'd', 'b', 'c']);
  });

  it('move a table as one block, and move a block past a whole table', () => {
    make([para('a', 'one'), ...table(), para('b', 'two')]);
    put('b');
    editor.chain().moveBlocksUp().run();
    expect(ids()).toEqual(['a', 'b', 't1', 't2', 't3', 't4']);
    // With the caret in a cell, the whole table moves.
    put('t3');
    editor.chain().moveBlocksUp().run();
    expect(ids()).toEqual(['a', 't1', 't2', 't3', 't4', 'b']);
    editor.chain().moveBlocksUp().run();
    expect(ids()).toEqual(['t1', 't2', 't3', 't4', 'a', 'b']);
    expect(editor.state.selection).toEqual(caret('t3'));
  });

  it('keep two tables apart when one moves past the other', () => {
    make([...table('t'), ...table('u')]);
    put('u1');
    editor.chain().moveBlocksUp().run();
    expect(ids()).toEqual(['u1', 'u2', 'u3', 'u4', 't1', 't2', 't3', 't4']);
  });

  it('move a list item with the items nested under it, past whole nested items', () => {
    make([bullet('x', 'x'), bullet('x1', 'x child', 1), bullet('y', 'y'), bullet('y1', 'y child', 1), para('p', 'end')]);
    put('x');
    editor.chain().moveBlocksDown().run();
    expect(ids()).toEqual(['y', 'y1', 'x', 'x1', 'p']);
    editor.chain().moveBlocksDown().run();
    expect(ids()).toEqual(['y', 'y1', 'p', 'x', 'x1']);
    // A nested item moves on its own, one block at a time.
    put('y1');
    editor.chain().moveBlocksUp().run();
    expect(ids()).toEqual(['y1', 'y', 'p', 'x', 'x1']);
  });
});

describe('moveBlock', () => {
  it('moves a block, with its nested items or its whole table, to a place in the document', () => {
    make([para('a', 'one'), bullet('x', 'x'), bullet('x1', 'x child', 1), ...table(), para('b', 'two')]);
    put('b', 1);
    // Places are indexes between blocks: 0 is before the first one.
    editor.chain().moveBlock('x', 0).run();
    expect(ids()).toEqual(['x', 'x1', 'a', 't1', 't2', 't3', 't4', 'b']);
    editor.chain().moveBlock('t2', 8).run();
    expect(ids()).toEqual(['x', 'x1', 'a', 'b', 't1', 't2', 't3', 't4']);
    // The caret stays where it was.
    expect(editor.state.selection).toEqual(caret('b', 1));
  });

  it('does not put a block inside a table or inside itself', () => {
    make([para('a', 'one'), ...table(), bullet('x', 'x'), bullet('x1', 'x child', 1), para('b', 'two')]);
    const before = editor.state.doc;
    // Inside the table: the block goes before the table instead.
    editor.chain().moveBlock('b', 3).run();
    expect(ids()).toEqual(['a', 'b', 't1', 't2', 't3', 't4', 'x', 'x1']);
    editor.undo();
    const undone = editor.state.doc;
    expect(undone.blocks).toEqual(before.blocks);
    for (const [id, to] of [['x', 5], ['x', 6], ['x', 7], ['x', 99], ['x', -1], ['missing', 0]] as const) {
      editor.chain().moveBlock(id, to).run();
    }
    expect(editor.state.doc.blocks).toEqual(undone.blocks);
    expect(editor.undo()).toBe(false);
  });
});

describe('duplicateBlock and deleteBlock', () => {
  it('duplicateBlock copies the block below itself with new ids and puts the caret in the copy', () => {
    make([para('a', 'one'), para('b', 'two')]);
    put('a', 2);
    editor.chain().duplicateBlock('a').run();
    expect(texts()).toEqual(['one', 'one', 'two']);
    const copy = editor.state.doc.blocks[1];
    expect(copy.id).not.toBe('a');
    expect(editor.state.selection).toEqual(caret(copy.id, 2));
  });

  it('duplicating a table makes a second table, not more rows of the first', () => {
    make([para('a', 'one'), ...table()]);
    editor.chain().duplicateBlock('t2').run();
    const blocks = editor.state.doc.blocks;
    expect(blocks.map((b) => getBlockText(b))).toEqual(['one', 'A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']);
    const copy = blocks.slice(5);
    expect(new Set(copy.map((b) => b.attrs!.table)).size).toBe(1);
    expect(copy[0].attrs!.table).not.toBe('t');
    expect(copy[0].attrs!.row).toBe(copy[1].attrs!.row);
    expect(copy[0].attrs!.row).not.toBe(copy[2].attrs!.row);
    expect(copy[0].attrs!.row).not.toBe('tr1');
  });

  it('the copy keeps formatting but not comments, which stay on their own text', () => {
    make([
      createBlock('paragraph', {}, [createTextNode('note', [{ type: 'bold' }, { type: 'comment', attrs: { ids: 'c-1' } }])], 'a'),
    ]);
    editor.chain().duplicateBlock('a').run();
    expect(editor.state.doc.blocks[1].content).toEqual([{ text: 'note', marks: [{ type: 'bold' }] }]);
    expect(editor.state.doc.blocks[0].content[0].marks).toHaveLength(2);
  });

  it('duplicating a list item copies the items nested under it', () => {
    make([bullet('x', 'x'), bullet('x1', 'x child', 1)]);
    editor.chain().duplicateBlock('x').run();
    expect(texts()).toEqual(['x', 'x child', 'x', 'x child']);
    expect(editor.state.doc.blocks[3].attrs).toEqual({ indent: 1 });
  });

  it('deleteBlock removes the block (a table whole) and puts the caret in the next block', () => {
    make([para('a', 'one'), ...table(), para('b', 'two')]);
    put('t3', 1);
    editor.chain().deleteBlock('t3').run();
    expect(ids()).toEqual(['a', 'b']);
    expect(editor.state.selection).toEqual(caret('b'));
    editor.chain().deleteBlock('b').run();
    expect(ids()).toEqual(['a']);
    expect(editor.state.selection).toEqual(caret('a', 3));
    // The last block leaves an empty paragraph.
    editor.chain().deleteBlock('a').run();
    expect(editor.state.doc.blocks).toHaveLength(1);
    expect(editor.state.doc.blocks[0].type).toBe('paragraph');
    expect(texts()).toEqual(['']);
    editor.undo();
    expect(ids()).toEqual(['a']);
  });
});

describe('block move shortcuts', () => {
  it('Mod+Shift+Up and Mod+Shift+Down move the selected blocks', () => {
    make([para('a', 'one'), para('b', 'two')]);
    put('b');
    expect(key('ArrowUp', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(ids()).toEqual(['b', 'a']);
    key('ArrowDown', { metaKey: true, shiftKey: true });
    expect(ids()).toEqual(['a', 'b']);
  });

  it('leave the keys to the browser at the edge of the document and in a locked editor', () => {
    make([para('a', 'one'), para('b', 'two')]);
    put('a');
    // At the top there is nowhere to go: Mod+Shift+Up selects to the start as usual.
    expect(key('ArrowUp', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    editor.setEditable(false);
    expect(key('ArrowDown', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(ids()).toEqual(['a', 'b']);
  });
});
