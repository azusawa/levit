import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { domPointToPosition, domSelectionToEditorSelection } from '../../src/core/view/selection';

const cell = (id: string, row: string, text = '', header = false) =>
  createBlock('table_cell', header ? { table: 't', row, header: true } : { table: 't', row }, [createTextNode(text)], id);
const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);

let element: HTMLElement;
let editor: LevitEditor;

function make(blocks = [para('p', 'before'), cell('a', 'r1', 'A', true), cell('b', 'r1', 'B', true), cell('c', 'r2', 'C'), cell('d', 'r2', 'D'), para('q', 'after')]) {
  editor = new LevitEditor({ element, initialContent: { version: 1, blocks } });
  return editor;
}

/** Puts the caret in a block. */
function place(blockId: string, offset: number) {
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true }));
}

/** Each table as rows of cells: tag and text. */
function tables() {
  return Array.from(element.querySelectorAll('table')).map((table) =>
    Array.from(table.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.children).map((td) => `${td.tagName.toLowerCase()}:${td.textContent}`)
    )
  );
}

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  editor?.destroy();
  element.remove();
});

describe('drawing a table', () => {
  it('draws the cells in a table, header cells as th', () => {
    make();
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:C', 'td:D']]]);
    const top = Array.from(element.children).map((el) => el.tagName.toLowerCase());
    expect(top).toEqual(['p', 'div', 'p']);
    expect(element.children[1].classList.contains('levit-table')).toBe(true);
    expect(element.querySelector('td')!.getAttribute('data-block-id')).toBe('c');
    expect(element.querySelector('th')!.getAttribute('scope')).toBe('col');
  });

  it('marks empty cells like empty blocks', () => {
    make([cell('a', 'r1', '')]);
    const td = element.querySelector('td')!;
    expect(td.classList.contains('is-empty')).toBe(true);
    expect(td.querySelector('br')).not.toBeNull();
  });

  it('follows typing in a cell without rebuilding the table', () => {
    make();
    const table = element.querySelector('table');
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'c', offset: 1 }, head: { blockId: 'c', offset: 1 }, isCollapsed: true }).insertText('x'));
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:Cx', 'td:D']]]);
    expect(element.querySelector('table')).toBe(table);
  });

  it('follows rows and columns being added and removed', () => {
    make();
    place('c', 0);
    editor.chain().addRowAfter().run();
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:C', 'td:D'], ['td:', 'td:']]]);
    editor.chain().addColumnBefore().run();
    expect(tables()).toEqual([[['th:', 'th:A', 'th:B'], ['td:', 'td:C', 'td:D'], ['td:', 'td:', 'td:']]]);
    editor.chain().deleteRow().run();
    editor.chain().deleteColumn().run();
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:C', 'td:D']]]);
    editor.chain().toggleHeaderRow().run();
    expect(tables()).toEqual([[['td:A', 'td:B'], ['td:C', 'td:D']]]);
    editor.chain().deleteTable().run();
    expect(tables()).toEqual([]);
    expect(Array.from(element.children).map((el) => el.textContent)).toEqual(['before', 'after']);
  });

  it('inserts a table from a command', () => {
    make([para('p', '')]);
    editor.chain().insertTable(2, 3).run();
    expect(tables()).toEqual([[['th:', 'th:', 'th:'], ['td:', 'td:', 'td:']]]);
    expect(editor.isInTable()).toBe(true);
  });

  it('draws two tables next to each other apart', () => {
    make([cell('a', 'r1', 'A'), createBlock('table_cell', { table: 'u', row: 'r1' }, [createTextNode('B')], 'b')]);
    expect(tables()).toEqual([[['td:A']], [['td:B']]]);
  });

  it('removes what the browser puts inside a table when repairing', () => {
    make();
    element.querySelector('tr')!.appendChild(document.createElement('td'));
    element.querySelector('tbody')!.appendChild(document.createTextNode('junk'));
    editor.repairDOM();
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:C', 'td:D']]]);
    expect(element.querySelector('tbody')!.childNodes.length).toBe(2);
  });

  it('undo brings a deleted table back', () => {
    make();
    place('a', 0);
    editor.chain().deleteTable().run();
    editor.undo();
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:C', 'td:D']]]);
  });
});

describe('the caret in a table', () => {
  it('maps a point in a cell to the cell', () => {
    make();
    const td = element.querySelector('[data-block-id="d"]')!;
    expect(domPointToPosition(element, td.firstChild!, 1)).toEqual({ blockId: 'd', offset: 1 });
  });

  it('maps a point between cells to the cell after it, or the end of the last one', () => {
    make();
    const tr = element.querySelectorAll('tr')[1];
    expect(domPointToPosition(element, tr, 1)).toEqual({ blockId: 'd', offset: 0 });
    expect(domPointToPosition(element, tr, 2)).toEqual({ blockId: 'd', offset: 1 });
    const table = element.querySelector('table')!;
    expect(domPointToPosition(element, table, 0)).toEqual({ blockId: 'a', offset: 0 });
  });

  it('knows when the caret is in a table', () => {
    make();
    place('p', 0);
    expect(editor.isInTable()).toBe(false);
    place('b', 0);
    expect(editor.isInTable()).toBe(true);
  });
});

describe('keys in a table', () => {
  const press = (key: string, shiftKey = false) => {
    const e = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    editor.container.dispatchEvent(e);
    return e;
  };

  it('Tab goes to the next cell and Shift+Tab back', () => {
    make();
    editor.focus();
    place('a', 0);
    expect(press('Tab').defaultPrevented).toBe(true);
    expect(editor.state.selection.head).toEqual({ blockId: 'b', offset: 1 });
    expect(press('Tab', true).defaultPrevented).toBe(true);
    expect(editor.state.selection.head).toEqual({ blockId: 'a', offset: 1 });
  });

  it('Tab in the last cell adds a row', () => {
    make();
    editor.focus();
    place('d', 1);
    press('Tab');
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:C', 'td:D'], ['td:', 'td:']]]);
  });

  it('Shift+Tab in the first cell lets focus leave the editor', () => {
    make();
    editor.focus();
    place('a', 0);
    expect(press('Tab', true).defaultPrevented).toBe(false);
  });

  it('Enter starts a new line in the cell', () => {
    make();
    editor.focus();
    place('c', 1);
    press('Enter');
    expect(editor.state.doc.blocks.find((b) => b.id === 'c')!.content[0].text).toBe('C\n');
    expect(tables()[0]).toHaveLength(2);
  });
});

describe('review fixes: the view', () => {
  it('pasting a Markdown table as plain text makes a table', async () => {
    const { readClipboard } = await import('../../src/core/view/clipboard');
    const data = { getData: (type: string) => (type === 'text/plain' ? '| a | b |\n|---|---|\n| 1 | 2 |' : '') } as DataTransfer;
    const content = readClipboard(data, false) as { blocks: { type: string }[] };
    expect(content.blocks.map((b) => b.type)).toEqual(['table_cell', 'table_cell', 'table_cell', 'table_cell']);
  });

  it('a stray node the browser leaves in a row is cleaned up', async () => {
    make();
    element.querySelector('tr')!.appendChild(document.createTextNode('junk'));
    await new Promise((r) => setTimeout(r, 0));
    expect(element.querySelector('tr')!.textContent).toBe('AB');
  });
});

describe('review fixes: bad ids', () => {
  it('draws cells whose table or row id is not a string instead of failing', () => {
    const odd = { toString: 1 } as unknown as string;
    make([createBlock('table_cell', { table: odd, row: odd }, [createTextNode('A')], 'a'), para('p', 'x')]);
    expect(tables()).toEqual([[['td:A']]]);
  });
});

describe('Firefox cell selection', () => {
  /** Firefox selects cells dragged across as one range per cell, each around its td. */
  function cellRange(id: string) {
    const range = document.createRange();
    range.selectNode(element.querySelector(`[data-block-id="${id}"]`)!);
    return range;
  }

  function selectCells(...ids: string[]) {
    selectRanges(ids.map(cellRange));
  }

  /** The anchor is the start of the range at anchorIndex (the first by default). */
  function selectRanges(ranges: Range[], anchorIndex = 0) {
    const first = ranges[anchorIndex];
    vi.spyOn(window, 'getSelection').mockReturnValue({
      rangeCount: ranges.length,
      getRangeAt: (i: number) => ranges[i],
      anchorNode: first.startContainer,
      anchorOffset: first.startOffset,
      isCollapsed: false,
      removeAllRanges: () => {},
      addRange: () => {},
    } as unknown as Selection);
  }

  afterEach(() => vi.restoreAllMocks());

  it('reads every selected cell, not just the first', () => {
    make();
    selectCells('c', 'd');
    expect(domSelectionToEditorSelection(element)).toEqual({
      anchor: { blockId: 'c', offset: 0 },
      head: { blockId: 'd', offset: 1 },
      isCollapsed: false,
    });
  });

  it('reads the cells in document order whatever order the ranges come in', () => {
    make();
    const ranges = ['d', 'b', 'c'].map(cellRange);
    selectRanges(ranges, 1);
    expect(domSelectionToEditorSelection(element)).toEqual({
      anchor: { blockId: 'b', offset: 0 },
      head: { blockId: 'd', offset: 1 },
      isCollapsed: false,
    });
  });

  it('a selected cell ends at its own end, not at the start of the next cell', () => {
    make();
    selectCells('a');
    expect(domSelectionToEditorSelection(element)).toEqual({
      anchor: { blockId: 'a', offset: 0 },
      head: { blockId: 'a', offset: 1 },
      isCollapsed: false,
    });
  });

  it('keeps the direction of a drag that goes back', () => {
    make();
    const ranges = ['c', 'd'].map(cellRange);
    selectRanges(ranges, 1);
    expect(domSelectionToEditorSelection(element)).toEqual({
      anchor: { blockId: 'd', offset: 1 },
      head: { blockId: 'c', offset: 0 },
      isCollapsed: false,
    });
  });

  it('ignores ranges outside the editor', () => {
    make();
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.insertBefore(outside, element);
    const ranges = [document.createRange(), ...['c', 'd'].map(cellRange)];
    ranges[0].selectNodeContents(outside);
    selectRanges(ranges, 1);
    expect(domSelectionToEditorSelection(element)).toEqual({
      anchor: { blockId: 'c', offset: 0 },
      head: { blockId: 'd', offset: 1 },
      isCollapsed: false,
    });
    outside.remove();
  });

  it('a column selection never reaches the cells between the selected ones', () => {
    make();
    selectCells('a', 'c');
    editor.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(tables()[0][0][1]).toBe('th:B');
  });

  it('Backspace empties all the selected cells', () => {
    make();
    selectCells('c', 'd');
    editor.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:', 'td:']]]);
  });
});

describe('table shortcuts', () => {
  const press = (key: string, mods: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
    editor.container.dispatchEvent(e);
    return e;
  };

  it('Mod+Enter adds a row below and puts the caret in it', () => {
    make();
    editor.focus();
    place('a', 1);
    expect(press('Enter', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:', 'td:'], ['td:C', 'td:D']]]);
    expect(editor.state.doc.blocks.findIndex((b) => b.id === editor.state.selection.head.blockId)).toBe(3);
    press('Enter', { metaKey: true });
    expect(tables()[0]).toHaveLength(4);
  });

  it('Mod+Alt+Enter adds a column right and puts the caret in it', () => {
    make();
    editor.focus();
    place('c', 1);
    expect(press('Enter', { ctrlKey: true, altKey: true }).defaultPrevented).toBe(true);
    expect(tables()).toEqual([[['th:A', 'th:', 'th:B'], ['td:C', 'td:', 'td:D']]]);
    expect(editor.state.doc.blocks.findIndex((b) => b.id === editor.state.selection.head.blockId)).toBe(5);
  });

  it('Mod+Shift+Backspace deletes the row', () => {
    make();
    editor.focus();
    place('c', 1);
    expect(press('Backspace', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(true);
    expect(tables()).toEqual([[['th:A', 'th:B']]]);
  });

  it('Mod+Alt+Backspace deletes the column', () => {
    make();
    editor.focus();
    place('c', 1);
    expect(press('Backspace', { ctrlKey: true, altKey: true }).defaultPrevented).toBe(true);
    expect(tables()).toEqual([[['th:B'], ['td:D']]]);
  });

  it('outside a table the keys do what they did before', () => {
    make();
    editor.focus();
    place('p', 1);
    expect(press('Backspace', { ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(press('Backspace', { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
    press('Enter', { ctrlKey: true, altKey: true });
    press('Enter', { ctrlKey: true });
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:C', 'td:D']]]);
    expect(editor.state.doc.blocks.map((b) => b.type)).toEqual(['paragraph', 'table_cell', 'table_cell', 'table_cell', 'table_cell', 'paragraph']);
  });

  it('with text selected across cells the keys do nothing to the table', () => {
    make();
    editor.focus();
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'a', offset: 0 }, head: { blockId: 'd', offset: 1 }, isCollapsed: false }));
    press('Backspace', { ctrlKey: true, shiftKey: true });
    expect(tables()).toEqual([[['th:A', 'th:B'], ['td:C', 'td:D']]]);
  });
});
