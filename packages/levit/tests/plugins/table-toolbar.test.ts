import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
    for (const b of toolbar.element.querySelectorAll('button')) expect(b.title).toBe(b.getAttribute('aria-label'));
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
});
