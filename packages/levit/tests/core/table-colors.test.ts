import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { createTableToolbar, type TableToolbarInstance } from '../../src/plugins/table-toolbar';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown } from '../../src/serializers/markdown';
import { getDocumentSchema, validateDocument } from '../../src/ai/schema';
import { ko } from '../../src/i18n/messages';
import type { DocumentData } from '../../src/core/model/types';

const cell = (id: string, row: string, text = '', attrs: Record<string, unknown> = {}) =>
  createBlock('table_cell', { table: 't', row, ...attrs }, [createTextNode(text)], id);
const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const doc = (...blocks: ReturnType<typeof cell>[]): DocumentData => ({ version: 1, blocks });

let element: HTMLElement;
let editor: LevitEditor;
let toolbar: TableToolbarInstance | undefined;

function make(options: { messages?: typeof ko } = {}) {
  editor = new LevitEditor({
    element,
    messages: options.messages,
    initialContent: doc(para('p', 'before'), cell('a', 'r1', 'A'), cell('b', 'r1', 'B'), cell('c', 'r2', 'C'), cell('d', 'r2', 'D')),
  });
}

function place(anchor: string, head = anchor) {
  editor.focus();
  editor.dispatch(
    editor.state.tr.setSelection({ anchor: { blockId: anchor, offset: 0 }, head: { blockId: head, offset: 1 }, isCollapsed: false })
  );
  if (anchor === head) {
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: anchor, offset: 0 }, head: { blockId: anchor, offset: 0 }, isCollapsed: true }));
  }
}

const backgrounds = () => editor.state.doc.blocks.filter((b) => b.type === 'table_cell').map((b) => b.attrs?.background ?? null);
const press = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  toolbar?.destroy();
  toolbar = undefined;
  editor?.destroy();
  element.remove();
});

describe('cell colors', () => {
  it('colors the cell with the caret, and takes the color off', () => {
    make();
    place('b');
    editor.chain().setCellBackground('green').run();
    expect(backgrounds()).toEqual([null, 'green', null, null]);
    expect(editor.getCellBackground()).toBe('green');
    editor.chain().setCellBackground('#123456').run();
    expect(backgrounds()).toEqual([null, '#123456', null, null]);
    editor.chain().setCellBackground(null).run();
    expect(backgrounds()).toEqual([null, null, null, null]);
    expect(editor.getCellBackground()).toBeNull();
  });

  it('colors every selected cell', () => {
    make();
    place('a', 'c');
    editor.chain().setCellBackground('blue').run();
    expect(backgrounds()).toEqual(['blue', 'blue', 'blue', null]);
  });

  it('ignores what is not a color, and text outside a table', () => {
    make();
    place('a');
    editor.chain().setCellBackground('red;x').run();
    place('p');
    editor.chain().setCellBackground('red').run();
    expect(backgrounds()).toEqual([null, null, null, null]);
    expect(editor.state.doc.blocks[0].attrs).toEqual({});
  });

  it('draws the cell in its color', () => {
    make();
    place('b');
    editor.chain().setCellBackground('green').run();
    const td = element.querySelector('[data-block-id="b"]') as HTMLElement;
    expect(td.dataset.color).toBe('green');
    expect(td.style.backgroundColor).toBe('var(--levit-bg-green, #dcfce7)');
    editor.chain().setCellBackground(null).run();
    const again = element.querySelector('[data-block-id="b"]') as HTMLElement;
    expect(again.dataset.color).toBeUndefined();
    expect(again.style.backgroundColor).toBe('');
  });

  it('draws no style for a value that is not a color', () => {
    editor = new LevitEditor({ element, initialContent: doc(cell('a', 'r1', 'A', { background: 'red;background:url(x)' })) });
    expect(element.querySelector('td')!.getAttribute('style')).toBeNull();
  });
});

describe('cell colors in HTML and elsewhere', () => {
  it('writes the color name and a style that works without Levit', () => {
    expect(documentToHTML(doc(cell('a', 'r1', 'A', { background: 'green' })))).toBe(
      '<table><tbody><tr><td data-color="green" style="background-color: var(--levit-bg-green, #dcfce7)">A</td></tr></tbody></table>'
    );
    expect(documentToHTML(doc(cell('a', 'r1', 'A', { background: '"><x' })))).toBe('<table><tbody><tr><td>A</td></tr></tbody></table>');
  });

  it('reads its own colors back, and pasted ones as the nearest named color', () => {
    const back = htmlToDocument(documentToHTML(doc(cell('a', 'r1', 'A', { background: 'green' }), cell('b', 'r1', 'B', { background: '#123456' }))));
    expect(back.blocks.map((b) => b.attrs?.background)).toEqual(['green', '#123456']);
    const pasted = htmlToDocument('<table><tr><td style="background-color:#ff0000">A</td><td style="background-color:#ffffff">B</td></tr></table>');
    expect(pasted.blocks.map((b) => b.attrs?.background)).toEqual(['red', undefined]);
  });

  it('Markdown keeps the table and drops the colors', () => {
    expect(documentToMarkdown(doc(cell('a', 'r1', 'A', { background: 'green' }), cell('b', 'r2', 'B')))).not.toContain('green');
  });

  it('the AI document schema allows cell colors, and only valid ones', () => {
    expect(JSON.stringify(getDocumentSchema())).toContain('"background"');
    expect(validateDocument(doc(cell('a', 'r1', 'A', { background: 'green' }))).valid).toBe(true);
    expect(validateDocument(doc(cell('a', 'r1', 'A', { background: 'url(x)' }))).valid).toBe(false);
  });
});

describe('the cell color button in the table toolbar', () => {
  it('opens a palette of cell colors in place of the buttons', () => {
    make();
    toolbar = createTableToolbar(editor);
    place('b');
    const button = toolbar.element.querySelector('button[aria-label="Table color"]')!;
    expect(button.getAttribute('aria-haspopup')).toBe('true');
    press(button);
    const panel = toolbar.element.querySelector('.levit-color-panel') as HTMLElement;
    expect(panel.hidden).toBe(false);
    expect((toolbar.element.querySelector('.levit-table-toolbar-buttons') as HTMLElement).hidden).toBe(true);
    expect(Array.from(panel.querySelectorAll('[role="group"]'), (g) => g.getAttribute('aria-label'))).toEqual(['Cell color', 'Line color']);
    expect(panel.querySelector('button')!.getAttribute('aria-label')).toBe('No color');
    expect(panel.querySelector('input[type="color"]')!.getAttribute('aria-label')).toBe('Other cell color');

    press(panel.querySelector('button[aria-label="Green"]')!);
    expect(backgrounds()).toEqual([null, 'green', null, null]);
    expect(panel.hidden).toBe(true);
    expect(toolbar.element.style.display).not.toBe('none');
  });

  it('marks the color of the cell, and picks any color', () => {
    make();
    toolbar = createTableToolbar(editor);
    place('b');
    editor.chain().setCellBackground('pink').run();
    const button = toolbar.element.querySelector('button[aria-label="Table color"]')!;
    press(button);
    const panel = toolbar.element.querySelector('.levit-color-panel') as HTMLElement;
    expect(Array.from(panel.querySelectorAll('[aria-pressed="true"]'), (b) => b.getAttribute('aria-label'))).toEqual(['Pink']);
    const picker = panel.querySelector('input[type="color"]') as HTMLInputElement;
    picker.value = '#abcdef';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    expect(backgrounds()).toEqual([null, '#abcdef', null, null]);
  });

  it('closes the palette when the caret leaves the table', () => {
    make();
    toolbar = createTableToolbar(editor);
    place('b');
    press(toolbar.element.querySelector('button[aria-label="Table color"]')!);
    place('p');
    place('b');
    expect((toolbar.element.querySelector('.levit-color-panel') as HTMLElement).hidden).toBe(true);
  });

  it('speaks the language of the editor', () => {
    make({ messages: ko });
    toolbar = createTableToolbar(editor);
    place('b');
    expect(toolbar.element.querySelector('button[aria-label="표 색"]')).not.toBeNull();
    expect(toolbar.element.querySelector('[aria-label="칸 색"] button[aria-label="색 없음"]')).not.toBeNull();
  });
});

describe('review fixes: the cell color palette', () => {
  it('Escape goes back to the Cell color button, not the text', () => {
    make();
    toolbar = createTableToolbar(editor);
    place('b');
    const button = toolbar.element.querySelector('button[aria-label="Table color"]') as HTMLButtonElement;
    button.focus();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    const swatch = document.activeElement as HTMLElement;
    expect(swatch.getAttribute('aria-label')).toBe('No color');
    swatch.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(button);
  });

  it('closes when the caret goes to another cell', () => {
    make();
    toolbar = createTableToolbar(editor);
    place('b');
    press(toolbar.element.querySelector('button[aria-label="Table color"]')!);
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'c', offset: 0 }, head: { blockId: 'c', offset: 0 }, isCollapsed: true }));
    expect(toolbar.element.style.display).not.toBe('none');
    expect((toolbar.element.querySelector('.levit-color-panel') as HTMLElement).hidden).toBe(true);
  });
});
