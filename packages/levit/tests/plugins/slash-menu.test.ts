import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createSlashMenu, type SlashMenuInstance } from '../../src/plugins/slash-menu';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';

let container: HTMLDivElement;
let editor: LevitEditor;
let menu: SlashMenuInstance;

function setup(blocks = [createBlock('paragraph', {}, [], 'p')]) {
  editor = new LevitEditor({ element: container, initialContent: createDocument(blocks) });
  menu = createSlashMenu(editor);
}

const caret = (blockId: string, offset: number) =>
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true }));

/** A key press as the browser sends it: keydown first, then the text goes in unless the key was taken. */
function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  container.dispatchEvent(event);
  if (event.defaultPrevented) return;
  if (key === 'Enter') editor.dispatch(editor.state.tr.splitBlock());
  else if (key === 'Backspace') editor.chain().deleteBackward().run();
  else if (key.length === 1) editor.dispatch(editor.state.tr.insertText(key));
}
const type = (text: string) => [...text].forEach(press);

const isOpen = () => container.getAttribute('aria-controls') === menu.element.id;
const shown = () => Array.from(menu.element.querySelectorAll('.levit-slash-title')).map((el) => el.textContent);
const blockText = (i = 0) => getBlockText(editor.state.doc.blocks[i]);

beforeEach(() => {
  document.body.textContent = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  menu?.destroy();
  editor?.destroy();
});

describe('slash menu: when it opens', () => {
  it('opens on "/" at the start of a line', () => {
    setup();
    caret('p', 0);
    type('/');
    expect(isOpen()).toBe(true);
    expect(shown()).toContain('Heading 1');
  });

  it('opens on "/" after a space', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Hello')], 'p')]);
    caret('p', 5);
    type(' /');
    expect(isOpen()).toBe(true);
  });

  it('stays closed for "/" inside a word or a link', () => {
    setup();
    caret('p', 0);
    type('and/or https://x');
    expect(isOpen()).toBe(false);
    expect(blockText()).toBe('and/or https://x');
  });

  it('stays closed in a code block, where "/" is part of the code', () => {
    setup([createBlock('code_block', {}, [], 'c')]);
    caret('c', 0);
    type('/');
    expect(isOpen()).toBe(false);
  });
});

describe('slash menu: typing after "/"', () => {
  it('narrows the list to the entries that match', () => {
    setup();
    caret('p', 0);
    type('/head');
    expect(isOpen()).toBe(true);
    expect(shown()).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
    type('ing 2');
    expect(shown()).toEqual(['Heading 2']);
  });

  it('closes when nothing matches, and Enter then splits the line as usual', () => {
    setup();
    caret('p', 0);
    type('/zzz');
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks).toHaveLength(2);
    expect(blockText(0)).toBe('/zzz');
  });

  it('choosing an entry removes the "/" and what was typed after it, and keeps the rest', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Intro')], 'p')]);
    caret('p', 5);
    type(' /quo');
    expect(shown()).toEqual(['Quote']);
    press('Enter');
    expect(isOpen()).toBe(false);
    expect(editor.state.doc.blocks[0].type).toBe('blockquote');
    expect(blockText()).toBe('Intro ');
  });

  it('closes when the "/" is deleted', () => {
    setup();
    caret('p', 0);
    type('/h');
    press('Backspace');
    expect(isOpen()).toBe(true);
    press('Backspace');
    expect(isOpen()).toBe(false);
    expect(blockText()).toBe('');
  });
});

describe('slash menu: never takes text it did not see typed', () => {
  it('stays closed for Mod+/ and other shortcuts, which type nothing', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Hello world')], 'p')]);
    caret('p', 6);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true, cancelable: true }));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks.map((b) => getBlockText(b))).toEqual(['Hello ', 'world']);
  });

  it('closes when undo takes the "/" away', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Intro')], 'p')]);
    caret('p', 5);
    type(' ');
    type('/he');
    expect(isOpen()).toBe(true);
    while (blockText().includes('/')) editor.undo();
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks.map((b) => getBlockText(b))[0]).toMatch(/^Intro/);
  });

  it('closes when the caret moves before the "/", also without a transaction (arrow keys, clicks)', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Intro ')], 'p')]);
    caret('p', 6);
    type('/he');
    editor.setSelectionQuietly({ anchor: { blockId: 'p', offset: 2 }, head: { blockId: 'p', offset: 2 }, isCollapsed: true });
    expect(isOpen()).toBe(false);
  });

  it('closes when a space follows the "/", as in "red / blue"', () => {
    setup();
    caret('p', 0);
    type('red / b');
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks.map((b) => getBlockText(b))).toEqual(['red / b', '']);
  });

  it('leaves Enter and the arrows to the IME while it is composing', () => {
    setup();
    caret('p', 0);
    type('/');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    // happy-dom leaves isComposing out of the event init.
    Object.defineProperty(enter, 'isComposing', { value: true });
    container.dispatchEvent(enter);
    // The menu chose nothing: the line is still a paragraph holding the "/".
    expect(editor.state.doc.blocks[0].type).toBe('paragraph');
    expect(blockText()).toBe('/');
  });
});

describe('slash menu: closing', () => {
  it('closes when the caret moves to another line', () => {
    setup([createBlock('paragraph', {}, [], 'p'), createBlock('paragraph', {}, [createTextNode('x')], 'q')]);
    caret('p', 0);
    type('/');
    caret('q', 1);
    expect(isOpen()).toBe(false);
  });

  it('closes when the editor loses focus', () => {
    setup();
    caret('p', 0);
    type('/');
    container.dispatchEvent(new FocusEvent('blur'));
    expect(isOpen()).toBe(false);
  });

  it('closes on a click outside it, but not on a click on an entry', () => {
    setup();
    caret('p', 0);
    type('/');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(isOpen()).toBe(false);

    press('Backspace');
    type('/');
    expect(isOpen()).toBe(true);
    menu.element.querySelectorAll('.levit-slash-item')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(editor.state.doc.blocks[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
  });
});

describe('slash menu: tables', () => {
  const cell = (id: string, row: string, text = '') => createBlock('table_cell', { table: 't', row }, [createTextNode(text)], id);
  const rows = () => {
    const out: string[][] = [];
    let last = '';
    for (const b of editor.state.doc.blocks) {
      if (b.type !== 'table_cell') continue;
      if (b.attrs!.row !== last) out.push([]);
      last = b.attrs!.row;
      out[out.length - 1].push(getBlockText(b));
    }
    return out;
  };

  it('inserts a 3 by 3 table with a header row', () => {
    setup();
    caret('p', 0);
    type('/table');
    expect(shown()).toEqual(['Table']);
    press('Enter');
    press('Enter');
    expect(rows()).toEqual([['', '', ''], ['', '', ''], ['', '', '']]);
    expect(editor.state.doc.blocks.slice(0, 3).every((b) => b.attrs!.header)).toBe(true);
    expect(editor.isInTable()).toBe(true);
  });

  it('shows table commands, not block types, in a cell', () => {
    setup([cell('a', 'r1', 'A'), cell('b', 'r2', 'B')]);
    caret('a', 1);
    type(' /');
    expect(shown()).toEqual([
      'Add row above', 'Add row below', 'Add column left', 'Add column right',
      'Delete row', 'Delete column', 'Header row', 'Delete table',
    ]);
  });

  it('runs a table command and takes the typed "/" out of the cell', () => {
    setup([cell('a', 'r1', 'A'), cell('b', 'r2', 'B')]);
    caret('a', 1);
    type(' /col');
    expect(shown()).toEqual(['Add column left', 'Add column right', 'Delete column']);
    press('ArrowDown');
    press('Enter');
    expect(rows()).toEqual([['A ', ''], ['B', '']]);
  });

  it('lists the items for where the caret is', () => {
    setup([createBlock('paragraph', {}, [], 'p'), cell('a', 'r1', 'A')]);
    caret('p', 0);
    expect(menu.getItems().map((i) => i.id)).toContain('table');
    caret('a', 0);
    expect(menu.getItems().map((i) => i.id)).toContain('delete-table');
    expect(menu.getItems().map((i) => i.id)).not.toContain('heading-1');
  });
});

describe('slash menu: choosing a table size', () => {
  const picker = () => document.querySelector<HTMLElement>('.levit-table-picker')!;
  const pickerOpen = () => picker().style.display !== 'none';
  const size = () => picker().querySelector('[role="status"]')!.textContent;
  const on = () => picker().querySelectorAll('.levit-table-picker-cell.is-on').length;
  const pickerCell = (cols: number, rows: number) =>
    picker().querySelector<HTMLElement>(`.levit-table-picker-cell[data-cols="${cols}"][data-rows="${rows}"]`)!;
  const tableSize = () => {
    const cells = editor.state.doc.blocks.filter((b) => b.type === 'table_cell');
    const rowCount = new Set(cells.map((b) => b.attrs!.row)).size;
    return rowCount ? [cells.length / rowCount, rowCount] : null;
  };

  it('choosing Table opens a size grid at 3 by 3, and inserts nothing yet', () => {
    setup();
    caret('p', 0);
    type('/table');
    press('Enter');
    expect(pickerOpen()).toBe(true);
    expect(size()).toBe('3 columns, 3 rows');
    expect(on()).toBe(9);
    expect(tableSize()).toBeNull();
    expect(blockText()).toBe('');
    expect(isOpen()).toBe(false);
  });

  it('the arrows change the size, and Enter inserts it', () => {
    setup();
    caret('p', 0);
    type('/table');
    press('Enter');
    press('ArrowRight');
    press('ArrowRight');
    press('ArrowUp');
    expect(size()).toBe('5 columns, 2 rows');
    press('Enter');
    expect(tableSize()).toEqual([5, 2]);
    expect(pickerOpen()).toBe(false);
    expect(editor.isInTable()).toBe(true);
  });

  it('the size stays inside the grid', () => {
    setup();
    caret('p', 0);
    type('/table');
    press('Enter');
    for (let i = 0; i < 5; i++) press('ArrowLeft');
    for (let i = 0; i < 5; i++) press('ArrowUp');
    expect(size()).toBe('1 columns, 1 rows');
    for (let i = 0; i < 20; i++) press('ArrowRight');
    for (let i = 0; i < 20; i++) press('ArrowDown');
    expect(size()).toBe('10 columns, 8 rows');
  });

  it('Escape closes it without a table', () => {
    setup();
    caret('p', 0);
    type('/table');
    press('Enter');
    press('Escape');
    expect(pickerOpen()).toBe(false);
    expect(tableSize()).toBeNull();
    press('Enter');
    expect(editor.state.doc.blocks).toHaveLength(2);
  });

  it('the mouse picks a size by pointing and inserts it on a click', () => {
    setup();
    caret('p', 0);
    type('/table');
    press('Enter');
    pickerCell(4, 2).dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(size()).toBe('4 columns, 2 rows');
    expect(on()).toBe(8);
    const click = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    pickerCell(4, 2).dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(tableSize()).toEqual([4, 2]);
    expect(pickerOpen()).toBe(false);
  });

  it('closes on other keys, which type as usual, and when the editor loses focus', () => {
    setup();
    caret('p', 0);
    type('/table');
    press('Enter');
    press('a');
    expect(pickerOpen()).toBe(false);
    expect(blockText()).toBe('a');
    type(' /table');
    press('Enter');
    container.dispatchEvent(new FocusEvent('blur'));
    expect(pickerOpen()).toBe(false);
  });

  it('a size typed after the name inserts that size right away', () => {
    setup();
    caret('p', 0);
    type('/table 4x2');
    expect(shown()).toEqual(['Table 4×2']);
    press('Enter');
    expect(pickerOpen()).toBe(false);
    expect(tableSize()).toEqual([4, 2]);
    expect(blockText(0)).toBe('');
  });

  it('a size alone, with × or X, also works', () => {
    setup();
    caret('p', 0);
    type('/2×3');
    expect(shown()).toEqual(['Table 2×3']);
    press('Enter');
    expect(tableSize()).toEqual([2, 3]);
  });

  it('a size too big for a table matches nothing', () => {
    setup();
    caret('p', 0);
    type('/table 30x2');
    expect(isOpen()).toBe(false);
  });

  it('works with the name in the editor language', async () => {
    const { ko } = await import('../../src/i18n/messages');
    editor = new LevitEditor({ element: container, messages: ko, initialContent: createDocument([createBlock('paragraph', {}, [], 'p')]) });
    menu = createSlashMenu(editor);
    caret('p', 0);
    type('/표 3X2');
    expect(shown()).toEqual(['표 3×2']);
  });

  it('opens under the line the table goes in', () => {
    setup();
    caret('p', 0);
    const line = container.querySelector('[data-block-id="p"]')!;
    vi.spyOn(line, 'getBoundingClientRect').mockReturnValue(new DOMRect(30, 100, 400, 24));
    type('/table');
    press('Enter');
    expect(picker().style.top).toBe(`${124 + 6 + window.scrollY}px`);
    expect(picker().style.left).toBe(`${30 + window.scrollX}px`);
  });

  it('the grid is labelled and goes away with the menu', () => {
    setup();
    expect(picker().getAttribute('aria-label')).toBe('Table size');
    menu.destroy();
    expect(document.querySelector('.levit-table-picker')).toBeNull();
  });
});
