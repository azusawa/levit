import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { domPointToPosition } from '../../src/core/view/selection';

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
