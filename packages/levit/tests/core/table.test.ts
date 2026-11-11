import { describe, it, expect } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { createTable, isTableCell, tableAt } from '../../src/core/model/table';
import type { BlockNode, DocumentData } from '../../src/core/model/types';

function caret(blockId: string, offset: number) {
  return { anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true };
}

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
/** A cell of table t, row r, with id and text. */
const cell = (id: string, r: string, text = '', t = 't', header = false) =>
  createBlock('table_cell', header ? { table: t, row: r, header: true } : { table: t, row: r }, [createTextNode(text)], id);

/** A 2x2 table: a b / c d. */
const grid = () => [cell('a', 'r1', 'A'), cell('b', 'r1', 'B'), cell('c', 'r2', 'C'), cell('d', 'r2', 'D')];

function stateWith(blocks: BlockNode[], sel = caret(blocks[0].id, 0)) {
  return EditorState.create({ doc: createDocument(blocks) }).tr.setSelection(sel).apply();
}

const types = (doc: DocumentData) => doc.blocks.map((b) => b.type);
/** The text of each table's rows, or the type and text of other blocks. */
function shape(doc: DocumentData): unknown[] {
  const out: unknown[] = [];
  let i = 0;
  while (i < doc.blocks.length) {
    const t = tableAt(doc, doc.blocks[i].id);
    if (!t) {
      out.push(`${doc.blocks[i].type}:${getBlockText(doc.blocks[i])}`);
      i += 1;
      continue;
    }
    out.push(t.rows.map((row) => row.map((k) => getBlockText(doc.blocks[k]))));
    i = t.end + 1;
  }
  return out;
}

describe('table model', () => {
  it('makes a table of rows and columns, the first row a header', () => {
    const blocks = createTable(2, 3);
    expect(blocks).toHaveLength(6);
    expect(blocks.every((b) => b.type === 'table_cell')).toBe(true);
    const tables = new Set(blocks.map((b) => b.attrs!.table));
    expect(tables.size).toBe(1);
    const rows = blocks.map((b) => b.attrs!.row);
    expect(new Set(rows).size).toBe(2);
    expect(blocks.slice(0, 3).every((b) => b.attrs!.header === true)).toBe(true);
    expect(blocks.slice(3).every((b) => !b.attrs!.header)).toBe(true);
  });

  it('can leave out the header', () => {
    expect(createTable(1, 2, { header: false }).some((b) => b.attrs!.header)).toBe(false);
  });

  it('knows a table cell', () => {
    expect(isTableCell('table_cell')).toBe(true);
    expect(isTableCell('paragraph')).toBe(false);
  });

  it('finds the table, its rows and the cell position', () => {
    const doc = createDocument([para('p', 'x'), ...grid(), para('q', 'y')]);
    const t = tableAt(doc, 'd')!;
    expect(t.start).toBe(1);
    expect(t.end).toBe(4);
    expect(t.rows).toEqual([[1, 2], [3, 4]]);
    expect([t.row, t.col]).toEqual([1, 1]);
    expect(tableAt(doc, 'p')).toBeNull();
  });

  it('keeps two tables next to each other apart', () => {
    const doc = createDocument([cell('a', 'r1', 'A', 't1'), cell('b', 'r1', 'B', 't2')]);
    expect(tableAt(doc, 'a')!.rows).toEqual([[0]]);
    expect(tableAt(doc, 'b')!.rows).toEqual([[1]]);
  });
});

describe('inserting a table', () => {
  it('turns an empty paragraph into a table with a paragraph after it', () => {
    let state = stateWith([para('a', '')]);
    state = state.tr.insertTable(2, 2).apply();
    expect(shape(state.doc)).toEqual([[['', ''], ['', '']], 'paragraph:']);
    expect(state.selection.anchor).toEqual({ blockId: state.doc.blocks[0].id, offset: 0 });
  });

  it('goes after a paragraph with text, splitting it at the caret', () => {
    let state = stateWith([para('a', 'onetwo')], caret('a', 3));
    state = state.tr.insertTable(1, 2).apply();
    expect(shape(state.doc)).toEqual(['paragraph:one', [['', '']], 'paragraph:two']);
  });

  it('does nothing inside a table', () => {
    const state = stateWith(grid(), caret('a', 0));
    expect(state.tr.insertTable(2, 2).apply().doc.blocks).toEqual(state.doc.blocks);
  });

  it('refuses sizes that make no table', () => {
    const state = stateWith([para('a', '')]);
    expect(state.tr.insertTable(0, 2).apply().doc.blocks).toEqual(state.doc.blocks);
    expect(state.tr.insertTable(2, 0).apply().doc.blocks).toEqual(state.doc.blocks);
  });
});

describe('typing in a cell', () => {
  it('Enter makes a new line in the cell', () => {
    const state = stateWith(grid(), caret('a', 1)).tr.splitBlock().apply();
    expect(shape(state.doc)).toEqual([[['A\n', 'B'], ['C', 'D']]]);
    expect(state.selection.anchor).toEqual({ blockId: 'a', offset: 2 });
  });

  it('Markdown shortcuts do not change a cell', async () => {
    const { applyInputRules } = await import('../../src/core/plugin/input-rules');
    const tr = stateWith([cell('a', 'r1', '')], caret('a', 0)).tr.insertText('# ');
    applyInputRules(tr);
    expect(types(tr.apply().doc)).toEqual(['table_cell']);
  });

  it('block types do not change a cell', () => {
    const state = stateWith(grid(), caret('a', 0)).tr.setBlockType('heading', { level: 1 }).apply();
    expect(types(state.doc)).toEqual(['table_cell', 'table_cell', 'table_cell', 'table_cell']);
  });
});

describe('deleting around cells', () => {
  it('Backspace at the start of a cell does nothing', () => {
    const state = stateWith(grid(), caret('b', 0)).tr.deleteBackward().apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['C', 'D']]]);
    expect(state.selection.anchor).toEqual({ blockId: 'b', offset: 0 });
  });

  it('Delete at the end of a cell does nothing', () => {
    const state = stateWith(grid(), caret('a', 1)).tr.deleteForward().apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['C', 'D']]]);
  });

  it('Backspace after a table moves into its last cell', () => {
    const state = stateWith([...grid(), para('p', 'x')], caret('p', 0)).tr.deleteBackward().apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['C', 'D']], 'paragraph:x']);
    expect(state.selection.anchor).toEqual({ blockId: 'd', offset: 1 });
  });

  it('Delete before a table does not pull a cell in', () => {
    const state = stateWith([para('p', 'x'), ...grid()], caret('p', 1)).tr.deleteForward().apply();
    expect(shape(state.doc)).toEqual(['paragraph:x', [['A', 'B'], ['C', 'D']]]);
  });

  it('a selection across cells empties them and keeps the table', () => {
    const sel = { anchor: { blockId: 'a', offset: 0 }, head: { blockId: 'c', offset: 1 }, isCollapsed: false };
    const state = stateWith(grid(), sel).tr.deleteRange().apply();
    expect(shape(state.doc)).toEqual([[['', ''], ['', 'D']]]);
    expect(state.selection.anchor).toEqual({ blockId: 'a', offset: 0 });
  });

  it('a selection over a whole table removes it', () => {
    const sel = { anchor: { blockId: 'p', offset: 1 }, head: { blockId: 'q', offset: 1 }, isCollapsed: false };
    const state = stateWith([para('p', 'xy'), ...grid(), para('q', 'zw')], sel).tr.deleteRange().apply();
    expect(shape(state.doc)).toEqual(['paragraph:xw']);
  });

  it('selecting every cell of a table, and nothing around it, empties the cells', () => {
    const sel = { anchor: { blockId: 'a', offset: 0 }, head: { blockId: 'd', offset: 1 }, isCollapsed: false };
    const state = stateWith([para('p', 'x'), ...grid(), para('q', 'y')], sel).tr.deleteRange().apply();
    expect(shape(state.doc)).toEqual(['paragraph:x', [['', ''], ['', '']], 'paragraph:y']);
  });

  it('selecting everything in a document that is one table leaves an empty paragraph', () => {
    const state = stateWith(grid()).tr.selectAll().deleteRange().apply();
    expect(shape(state.doc)).toEqual(['paragraph:']);
  });

  it('a selection from text into a table keeps both apart', () => {
    const sel = { anchor: { blockId: 'p', offset: 1 }, head: { blockId: 'b', offset: 1 }, isCollapsed: false };
    const state = stateWith([para('p', 'xy'), ...grid()], sel).tr.deleteRange().apply();
    expect(shape(state.doc)).toEqual(['paragraph:x', [['', ''], ['C', 'D']]]);
    expect(state.selection.anchor).toEqual({ blockId: 'p', offset: 1 });
  });

  it('a selection from a table into text keeps both apart', () => {
    const sel = { anchor: { blockId: 'd', offset: 0 }, head: { blockId: 'q', offset: 1 }, isCollapsed: false };
    const state = stateWith([...grid(), para('q', 'zw')], sel).tr.deleteRange().apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['C', '']], 'paragraph:w']);
    expect(state.selection.anchor).toEqual({ blockId: 'd', offset: 0 });
  });

  it('typing over a selection across cells writes into the first cell', () => {
    const sel = { anchor: { blockId: 'a', offset: 1 }, head: { blockId: 'b', offset: 1 }, isCollapsed: false };
    const state = stateWith(grid(), sel).tr.insertText('z').apply();
    expect(shape(state.doc)).toEqual([[['Az', ''], ['C', 'D']]]);
  });
});

describe('inserting into a table', () => {
  it('a divider in a cell goes after the table', () => {
    const state = stateWith([...grid(), para('p', 'x')], caret('a', 1)).tr.insertHorizontalRule().apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['C', 'D']], 'horizontal_rule:', 'paragraph:x']);
    expect(state.selection.anchor).toEqual({ blockId: 'p', offset: 0 });
  });

  it('pasting several blocks into a cell puts them on lines of the cell', () => {
    const fragment = [para('x', 'one'), createBlock('heading', { level: 1 }, [createTextNode('two')], 'y')];
    const state = stateWith(grid(), caret('a', 1)).tr.insertFragment(fragment).apply();
    expect(shape(state.doc)).toEqual([[['Aone\ntwo', 'B'], ['C', 'D']]]);
    expect(state.selection.anchor).toEqual({ blockId: 'a', offset: 8 });
  });

  it('pasting a table into a cell pastes its text', () => {
    const state = stateWith(grid(), caret('a', 1)).tr.insertFragment([cell('x', 'r', 'X', 'u'), cell('y', 'r', 'Y', 'u')]).apply();
    expect(shape(state.doc)).toEqual([[['AX\nY', 'B'], ['C', 'D']]]);
  });

  it('pasting a table into a paragraph puts it between the two halves, as a new table', () => {
    const state = stateWith([para('p', 'xy'), ...grid()], caret('p', 1)).tr.insertFragment(grid()).apply();
    expect(shape(state.doc)).toEqual(['paragraph:x', [['A', 'B'], ['C', 'D']], 'paragraph:y', [['A', 'B'], ['C', 'D']]]);
    const pasted = state.doc.blocks[1];
    expect(pasted.attrs!.table).not.toBe('t');
    expect(pasted.attrs!.row).not.toBe('r1');
    expect(state.doc.blocks[2].attrs!.row).toBe(pasted.attrs!.row);
    expect(state.doc.blocks[3].attrs!.row).not.toBe(pasted.attrs!.row);
  });
});

describe('moving between cells', () => {
  it('goes to the next cell, then the next row', () => {
    let state = stateWith(grid(), caret('a', 0)).tr.goToNextCell().apply();
    expect(state.selection.anchor).toEqual({ blockId: 'b', offset: 1 });
    state = state.tr.goToNextCell().apply();
    expect(state.selection.anchor).toEqual({ blockId: 'c', offset: 1 });
  });

  it('adds a row after the last cell', () => {
    const state = stateWith(grid(), caret('d', 0)).tr.goToNextCell().apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['C', 'D'], ['', '']]]);
    expect(state.selection.anchor).toEqual({ blockId: state.doc.blocks[4].id, offset: 0 });
  });

  it('goes back to the previous cell, and stays in the first', () => {
    let state = stateWith(grid(), caret('c', 0)).tr.goToPreviousCell().apply();
    expect(state.selection.anchor).toEqual({ blockId: 'b', offset: 1 });
    state = stateWith(grid(), caret('a', 1)).tr.goToPreviousCell().apply();
    expect(state.selection.anchor).toEqual({ blockId: 'a', offset: 1 });
  });
});

describe('changing a table', () => {
  it('adds a row before or after the caret row, with the caret in the same column', () => {
    let state = stateWith(grid(), caret('b', 0)).tr.addRow('before').apply();
    expect(shape(state.doc)).toEqual([[['', ''], ['A', 'B'], ['C', 'D']]]);
    expect(state.selection.anchor).toEqual({ blockId: state.doc.blocks[1].id, offset: 0 });
    state = stateWith(grid(), caret('a', 0)).tr.addRow('after').apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['', ''], ['C', 'D']]]);
  });

  it('a new row is never a header', () => {
    const blocks = [cell('a', 'r1', 'A', 't', true), cell('b', 'r1', 'B', 't', true)];
    const state = stateWith(blocks, caret('a', 0)).tr.addRow('after').apply();
    expect(state.doc.blocks.slice(2).some((b) => b.attrs!.header)).toBe(false);
  });

  it('adds a column left or right of the caret', () => {
    let state = stateWith(grid(), caret('a', 0)).tr.addColumn('after').apply();
    expect(shape(state.doc)).toEqual([[['A', '', 'B'], ['C', '', 'D']]]);
    expect(state.selection.anchor).toEqual({ blockId: state.doc.blocks[1].id, offset: 0 });
    state = stateWith(grid(), caret('d', 0)).tr.addColumn('before').apply();
    expect(shape(state.doc)).toEqual([[['A', '', 'B'], ['C', '', 'D']]]);
  });

  it('a new column cell in a header row is a header', () => {
    const blocks = [cell('a', 'r1', 'A', 't', true), cell('c', 'r2', 'C')];
    const state = stateWith(blocks, caret('a', 0)).tr.addColumn('after').apply();
    expect(state.doc.blocks.map((b) => b.attrs!.header === true)).toEqual([true, true, false, false]);
  });

  it('deletes the caret row and moves the caret to the row that takes its place', () => {
    let state = stateWith(grid(), caret('b', 0)).tr.deleteRow().apply();
    expect(shape(state.doc)).toEqual([[['C', 'D']]]);
    expect(state.selection.anchor).toEqual({ blockId: 'd', offset: 1 });
    state = stateWith(grid(), caret('c', 0)).tr.deleteRow().apply();
    expect(state.selection.anchor).toEqual({ blockId: 'a', offset: 1 });
  });

  it('deletes the caret column', () => {
    const state = stateWith(grid(), caret('a', 0)).tr.deleteColumn().apply();
    expect(shape(state.doc)).toEqual([[['B'], ['D']]]);
    expect(state.selection.anchor).toEqual({ blockId: 'b', offset: 1 });
  });

  it('deleting the last row or column deletes the table', () => {
    let state = stateWith([cell('a', 'r1', 'A'), cell('b', 'r1', 'B'), para('p', 'x')], caret('a', 0)).tr.deleteRow().apply();
    expect(shape(state.doc)).toEqual(['paragraph:x']);
    state = stateWith([cell('a', 'r1', 'A'), cell('c', 'r2', 'C'), para('p', 'x')], caret('a', 0)).tr.deleteColumn().apply();
    expect(shape(state.doc)).toEqual(['paragraph:x']);
  });

  it('deletes the table and puts the caret in the text after it', () => {
    const state = stateWith([para('p', 'x'), ...grid(), para('q', 'y')], caret('c', 0)).tr.deleteTable().apply();
    expect(shape(state.doc)).toEqual(['paragraph:x', 'paragraph:y']);
    expect(state.selection.anchor).toEqual({ blockId: 'q', offset: 0 });
  });

  it('leaves an empty paragraph when nothing else can take the caret', () => {
    const state = stateWith(grid(), caret('a', 0)).tr.deleteTable().apply();
    expect(shape(state.doc)).toEqual(['paragraph:']);
    expect(state.selection.anchor.blockId).toBe(state.doc.blocks[0].id);
  });

  it('turns the header row on and off', () => {
    let state = stateWith(grid(), caret('d', 0)).tr.toggleHeaderRow().apply();
    expect(state.doc.blocks.map((b) => b.attrs!.header === true)).toEqual([true, true, false, false]);
    state = state.tr.toggleHeaderRow().apply();
    expect(state.doc.blocks.some((b) => b.attrs!.header)).toBe(false);
  });

  it('does nothing outside a table', () => {
    const state = stateWith([para('p', 'x')], caret('p', 0));
    for (const run of [
      (tr: typeof state.tr) => tr.addRow('after'),
      (tr: typeof state.tr) => tr.addColumn('after'),
      (tr: typeof state.tr) => tr.deleteRow(),
      (tr: typeof state.tr) => tr.deleteColumn(),
      (tr: typeof state.tr) => tr.deleteTable(),
      (tr: typeof state.tr) => tr.toggleHeaderRow(),
    ]) {
      const tr = run(state.tr);
      expect(tr.docChanged).toBe(false);
    }
  });

  it('works on ragged rows, as left by two people editing at once', () => {
    const blocks = [cell('a', 'r1', 'A'), cell('b', 'r1', 'B'), cell('c', 'r2', 'C')];
    let state = stateWith(blocks, caret('a', 0)).tr.addColumn('after').apply();
    expect(shape(state.doc)).toEqual([[['A', '', 'B'], ['C', '']]]);
    state = stateWith(blocks, caret('b', 0)).tr.deleteColumn().apply();
    expect(shape(state.doc)).toEqual([[['A'], ['C']]]);
    state = stateWith(blocks, caret('c', 0)).tr.addRow('after').apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['C'], ['', '']]]);
  });
});

describe('table cells are built in', () => {
  it('a plugin cannot define its own table_cell', async () => {
    const { Schema } = await import('../../src/core/plugin/plugin');
    expect(() => new Schema([{ name: 'x', blocks: [{ type: 'table_cell' }] }])).toThrow(/built in/);
  });
});

describe('rows whose cells are apart', () => {
  // Two people adding a column and a row at the same moment can leave a
  // row's cells with another row's cell between them.
  const split = () => [cell('a', 'r1', 'A'), cell('b', 'r1', 'B'), cell('c', 'r2', 'C'), cell('n', 'r3', 'N'), cell('e', 'r2', 'E')];

  it('groups cells by their row', () => {
    const doc = createDocument(split());
    const t = tableAt(doc, 'e')!;
    expect(t.rows).toEqual([[0, 1], [2, 4], [3]]);
    expect([t.row, t.col]).toEqual([1, 1]);
  });

  it('Tab follows the rows', () => {
    let state = stateWith(split(), caret('c', 0)).tr.goToNextCell().apply();
    expect(state.selection.anchor.blockId).toBe('e');
    state = state.tr.goToNextCell().apply();
    expect(state.selection.anchor.blockId).toBe('n');
    state = state.tr.goToPreviousCell().apply();
    expect(state.selection.anchor.blockId).toBe('e');
  });

  it('deletes all cells of a row', () => {
    const state = stateWith(split(), caret('c', 0)).tr.deleteRow().apply();
    expect(shape(state.doc)).toEqual([[['A', 'B'], ['N']]]);
  });

  it('adds a column to every row', () => {
    const state = stateWith(split(), caret('a', 0)).tr.addColumn('after').apply();
    expect(shape(state.doc)).toEqual([[['A', '', 'B'], ['C', '', 'E'], ['N', '']]]);
  });

  it('deletes a column from every row', () => {
    const state = stateWith(split(), caret('b', 0)).tr.deleteColumn().apply();
    expect(shape(state.doc)).toEqual([[['A'], ['C'], ['N']]]);
  });
});
