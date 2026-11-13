import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { createTableToolbar, type TableToolbarInstance } from '../../src/plugins/table-toolbar';
import { ko } from '../../src/i18n/messages';

const cell = (id: string, row: string, text = '', header = false) =>
  createBlock('table_cell', header ? { table: 't', row, header: true } : { table: 't', row }, [createTextNode(text)], id);
const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);

let element: HTMLElement;
let editor: LevitEditor;
let toolbar: TableToolbarInstance;

function make(options: { messages?: typeof ko } = {}) {
  editor = new LevitEditor({
    element,
    messages: options.messages,
    initialContent: {
      version: 1,
      blocks: [para('p', 'before'), cell('a', 'r1', 'A', true), cell('b', 'r1', 'B', true), cell('c', 'r2', 'C'), cell('d', 'r2', 'D'), para('q', 'after')],
    },
  });
  toolbar = createTableToolbar(editor);
}

/** Focuses the editor and puts the caret in a block. */
function place(blockId: string, offset = 0) {
  editor.focus();
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true }));
}

const isShown = () => toolbar.element.style.display !== 'none';
const button = (label: string) => toolbar.element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const press = (btn: HTMLElement) => btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
const key = (target: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const rows = () => Array.from(element.querySelectorAll('tr')).map((tr) => tr.children.length);

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  toolbar?.destroy();
  editor?.destroy();
  element.remove();
});

describe('table toolbar', () => {
  it('is a labelled toolbar with a button for each table command', () => {
    make();
    expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    expect(toolbar.element.getAttribute('aria-label')).toBe('Table tools');
    const labels = Array.from(toolbar.element.querySelectorAll('button')).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Add row above', 'Add row below', 'Add column left', 'Add column right',
      'Delete row', 'Delete column', 'Header row', 'Delete table',
    ]);
    for (const b of toolbar.element.querySelectorAll('button')) expect(b.title.startsWith(b.getAttribute('aria-label')!)).toBe(true);
  });

  it('shows the shortcuts of the buttons that have one', () => {
    make();
    expect(button('Add row below').title).toBe('Add row below (Ctrl+Enter)');
    expect(button('Add column right').title).toBe('Add column right (Ctrl+Alt+Enter)');
    expect(button('Delete row').title).toBe('Delete row (Ctrl+Shift+Backspace)');
    expect(button('Delete column').title).toBe('Delete column (Ctrl+Alt+Backspace)');
    expect(button('Add row below').getAttribute('aria-keyshortcuts')).toBe('Control+Enter');
    expect(button('Delete row').getAttribute('aria-keyshortcuts')).toBe('Control+Shift+Backspace');
    expect(button('Add row above').title).toBe('Add row above');
    expect(button('Add row above').hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('shows the shortcuts with Mac key symbols on a Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    make();
    expect(button('Add row below').title).toBe('Add row below (⌘↩)');
    expect(button('Add column right').title).toBe('Add column right (⌥⌘↩)');
    expect(button('Delete row').title).toBe('Delete row (⇧⌘⌫)');
    expect(button('Delete column').title).toBe('Delete column (⌥⌘⌫)');
    expect(button('Add row below').getAttribute('aria-keyshortcuts')).toBe('Meta+Enter');
    vi.restoreAllMocks();
  });

  it('uses the editor language', () => {
    make({ messages: ko });
    expect(toolbar.element.getAttribute('aria-label')).toBe('표 도구');
    expect(button(ko.addRowBelow)).toBeTruthy();
  });

  it('shows while the caret is in a table and hides outside one', () => {
    make();
    place('p');
    expect(isShown()).toBe(false);
    place('c', 1);
    expect(isShown()).toBe(true);
    place('q');
    expect(isShown()).toBe(false);
  });

  it('hides when the editor loses focus, but not when focus moves into the toolbar', () => {
    make();
    place('c');
    toolbar.element.querySelector('button')!.focus();
    expect(isShown()).toBe(true);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(isShown()).toBe(false);
    outside.remove();
  });

  it('the buttons change the table under the caret and keep the toolbar', () => {
    make();
    place('c', 1);
    press(button('Add row below'));
    expect(rows()).toEqual([2, 2, 2]);
    press(button('Add column right'));
    expect(rows()).toEqual([3, 3, 3]);
    press(button('Delete row'));
    press(button('Delete column'));
    expect(rows()).toEqual([2, 2]);
    expect(isShown()).toBe(true);
  });

  it('a button press keeps the editor selection', () => {
    make();
    place('c', 1);
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    button('Add row above').dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('the header row button shows and switches the header row', () => {
    make();
    place('c');
    expect(button('Header row').getAttribute('aria-pressed')).toBe('true');
    press(button('Header row'));
    expect(element.querySelectorAll('th').length).toBe(0);
    expect(button('Header row').getAttribute('aria-pressed')).toBe('false');
  });

  it('deleting the table hides the toolbar', () => {
    make();
    place('c');
    press(button('Delete table'));
    expect(element.querySelector('table')).toBeNull();
    expect(isShown()).toBe(false);
  });

  it('Alt+F10 in a table moves to the toolbar, arrows move, Escape goes back', () => {
    make();
    place('c', 1);
    expect(key(editor.container, 'F10', { altKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('Add row above'));
    key(document.activeElement as HTMLElement, 'ArrowRight');
    expect(document.activeElement).toBe(button('Add row below'));
    key(document.activeElement as HTMLElement, 'ArrowLeft');
    key(document.activeElement as HTMLElement, 'ArrowLeft');
    expect(document.activeElement).toBe(button('Delete table'));
    key(document.activeElement as HTMLElement, 'Escape');
    expect(document.activeElement).toBe(editor.container);
    expect(editor.state.selection.anchor).toEqual({ blockId: 'c', offset: 1 });
  });

  it('Enter on a focused button runs it', () => {
    make();
    place('c', 1);
    key(editor.container, 'F10', { altKey: true });
    key(document.activeElement as HTMLElement, 'ArrowRight');
    (document.activeElement as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(rows()).toEqual([2, 2, 2]);
  });

  it('Alt+F10 outside a table is left alone', () => {
    make();
    place('p', 1);
    expect(key(editor.container, 'F10', { altKey: true }).defaultPrevented).toBe(false);
  });

  it('an editor has one toolbar, and destroy removes it', () => {
    make();
    expect(createTableToolbar(editor)).toBe(toolbar);
    expect(document.body.contains(toolbar.element)).toBe(true);
    toolbar.destroy();
    expect(document.body.contains(toolbar.element)).toBe(false);
    expect(createTableToolbar(editor)).not.toBe(toolbar);
    createTableToolbar(editor).destroy();
  });

  it('deleting the table from the keyboard gives focus back to the editor', () => {
    make();
    place('c', 1);
    key(editor.container, 'F10', { altKey: true });
    key(document.activeElement as HTMLElement, 'End');
    expect(document.activeElement).toBe(button('Delete table'));
    (document.activeElement as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(isShown()).toBe(false);
    expect(document.activeElement).toBe(editor.container);
  });

  it('hides while text is selected, so it does not cover the formatting toolbar', () => {
    make();
    editor.focus();
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'c', offset: 0 }, head: { blockId: 'c', offset: 1 }, isCollapsed: false }));
    expect(isShown()).toBe(false);
  });

  it('hides in an editor that cannot be edited', () => {
    make();
    place('c', 1);
    editor.setEditable(false);
    place('d', 1);
    expect(isShown()).toBe(false);
  });

  it('stays at the top of the window over a table scrolled partly out of view, covering no text below it', () => {
    make();
    const wrapper = element.querySelector('.levit-table')!;
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 5, 300, 100));
    vi.spyOn(toolbar.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 30));
    place('c', 1);
    expect(toolbar.element.style.top).toBe(`${10 + window.scrollY}px`);
    expect(toolbar.element.style.left).toBe(`${40 + window.scrollX}px`);
  });

  it('goes below the table when almost all of it is out of view', () => {
    make();
    const wrapper = element.querySelector('.levit-table')!;
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, -80, 300, 100));
    vi.spyOn(toolbar.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 30));
    place('c', 1);
    expect(toolbar.element.style.top).toBe(`${-80 + 100 + 6 + window.scrollY}px`);
  });

  it('marks the editor so its tables keep room for the toolbar above them', () => {
    make();
    expect(editor.container.classList.contains('levit-has-table-toolbar')).toBe(true);
    toolbar.destroy();
    expect(editor.container.classList.contains('levit-has-table-toolbar')).toBe(false);
  });

  it('leaves the class on an element that had it before', () => {
    element.classList.add('levit-has-table-toolbar');
    make();
    toolbar.destroy();
    expect(element.classList.contains('levit-has-table-toolbar')).toBe(true);
  });

  it('goes away with the editor', () => {
    make();
    editor.destroy();
    expect(element.classList.contains('levit-has-table-toolbar')).toBe(false);
    expect(document.body.contains(toolbar.element)).toBe(false);
  });

  it('follows the table when a box around the editor scrolls', () => {
    make();
    place('c', 1);
    const wrapper = element.querySelector('.levit-table')!;
    vi.spyOn(toolbar.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 30));
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 300, 300, 100));
    element.dispatchEvent(new Event('scroll'));
    expect(toolbar.element.style.top).toBe(`${300 - 30 - 6 + window.scrollY}px`);
  });
});

describe('add buttons at the end of a table', () => {
  const addRow = () => document.querySelector<HTMLButtonElement>('.levit-table-add-row')!;
  const addColumn = () => document.querySelector<HTMLButtonElement>('.levit-table-add-column')!;
  const shown = (el: HTMLElement) => el.style.display !== 'none';
  const caretIndex = () => editor.state.doc.blocks.findIndex((b) => b.id === editor.state.selection.head.blockId);

  it('show below and right of the table with the toolbar, and hide with it', () => {
    make();
    place('p');
    expect(shown(addRow())).toBe(false);
    expect(shown(addColumn())).toBe(false);
    place('c', 1);
    expect(shown(addRow())).toBe(true);
    expect(shown(addColumn())).toBe(true);
    place('q');
    expect(shown(addRow())).toBe(false);
  });

  it('are labelled in the editor language and stay out of the Tab order', () => {
    make({ messages: ko });
    expect(addRow().getAttribute('aria-label')).toBe(ko.addRowAtEnd);
    expect(addColumn().getAttribute('aria-label')).toBe(ko.addColumnAtEnd);
    expect(addRow().title).toBe(ko.addRowAtEnd);
    expect(addRow().tabIndex).toBe(-1);
    expect(addColumn().tabIndex).toBe(-1);
    expect(addRow().textContent).toBe('+');
  });

  it('the row button adds a row at the end, with the caret in the caret column', () => {
    make();
    place('b', 1);
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    addRow().dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(rows()).toEqual([2, 2, 2]);
    expect(caretIndex()).toBe(6);
    expect(shown(addRow())).toBe(true);
  });

  it('the column button adds a column at the end, with the caret in the caret row', () => {
    make();
    place('c', 1);
    press(addColumn());
    expect(rows()).toEqual([3, 3]);
    expect(element.querySelectorAll('th').length).toBe(3);
    expect(caretIndex()).toBe(6);
  });

  it('sit just below and just right of the table', () => {
    make();
    const wrapper = element.querySelector('.levit-table')!;
    vi.spyOn(wrapper, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 300, 500, 100));
    vi.spyOn(toolbar.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 30));
    place('c', 1);
    expect(addRow().style.top).toBe(`${300 + 100 + 2 + window.scrollY}px`);
    expect(addRow().style.left).toBe(`${40 + window.scrollX}px`);
    expect(addRow().style.width).toBe('500px');
    expect(addColumn().style.top).toBe(`${300 + window.scrollY}px`);
    expect(addColumn().style.left).toBe(`${40 + 500 + 2 + window.scrollX}px`);
    expect(addColumn().style.height).toBe('100px');
  });

  it('destroy removes them', () => {
    make();
    toolbar.destroy();
    expect(document.querySelector('.levit-table-add-row')).toBeNull();
    expect(document.querySelector('.levit-table-add-column')).toBeNull();
  });
});

