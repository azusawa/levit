import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { createTableToolbar, type TableToolbarInstance } from '../../src/plugins/table-toolbar';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { getDocumentSchema, validateDocument } from '../../src/ai/schema';
import { ko } from '../../src/i18n/messages';
import type { DocumentData } from '../../src/core/model/types';

const cell = (id: string, row: string, text = '', attrs: Record<string, unknown> = {}, table = 't') =>
  createBlock('table_cell', { table, row, ...attrs }, [createTextNode(text)], id);
const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const doc = (...blocks: ReturnType<typeof cell>[]): DocumentData => ({ version: 1, blocks });

let element: HTMLElement;
let editor: LevitEditor;
let toolbar: TableToolbarInstance | undefined;

function make(options: { messages?: typeof ko } = {}) {
  editor = new LevitEditor({
    element,
    messages: options.messages,
    initialContent: doc(
      cell('a', 'r1', 'A'), cell('b', 'r1', 'B'), cell('c', 'r2', 'C'), cell('d', 'r2', 'D'),
      para('p', 'between'),
      cell('x', 'q1', 'X', {}, 'u')
    ),
  });
}

function caret(blockId: string) {
  editor.focus();
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset: 0 }, head: { blockId, offset: 0 }, isCollapsed: true }));
}

const borders = (table = 't') =>
  editor.state.doc.blocks.filter((b) => b.type === 'table_cell' && b.attrs?.table === table).map((b) => b.attrs?.border ?? null);
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

describe('table line colors', () => {
  it('colors the lines of the whole table with the caret, and takes the color off', () => {
    make();
    caret('b');
    editor.chain().setTableBorder('blue').run();
    expect(borders()).toEqual(['blue', 'blue', 'blue', 'blue']);
    expect(borders('u')).toEqual([null]);
    expect(editor.getTableBorder()).toBe('blue');
    editor.chain().setTableBorder('#123456').run();
    expect(borders()).toEqual(['#123456', '#123456', '#123456', '#123456']);
    editor.chain().setTableBorder(null).run();
    expect(borders()).toEqual([null, null, null, null]);
    expect(editor.getTableBorder()).toBeNull();
  });

  it('ignores what is not a color, and text outside a table', () => {
    make();
    caret('a');
    editor.chain().setTableBorder('red;x').run();
    caret('p');
    editor.chain().setTableBorder('red').run();
    expect(borders()).toEqual([null, null, null, null]);
    expect(editor.getTableBorder()).toBeNull();
  });

  it('a new row or column takes the color of the table', () => {
    make();
    caret('a');
    editor.chain().setTableBorder('green').run();
    editor.chain().addRowAfter().run();
    editor.chain().addColumnAfter().run();
    expect(borders().every((b) => b === 'green')).toBe(true);
    expect(borders()).toHaveLength(9);
  });

  it('draws the lines in the color', () => {
    make();
    caret('b');
    editor.chain().setTableBorder('red').run();
    const td = element.querySelector('[data-block-id="b"]') as HTMLElement;
    expect(td.dataset.border).toBe('red');
    expect(td.style.borderColor).toBe('var(--levit-color-red, #b91c1c)');
    editor.chain().setTableBorder(null).run();
    const again = element.querySelector('[data-block-id="b"]') as HTMLElement;
    expect(again.dataset.border).toBeUndefined();
    expect(again.getAttribute('style')).toBeNull();
  });

  it('keeps the cell color and the line color apart', () => {
    make();
    caret('b');
    editor.chain().setCellBackground('yellow').setTableBorder('red').run();
    editor.chain().setTableBorder(null).run();
    const td = element.querySelector('[data-block-id="b"]') as HTMLElement;
    expect(td.style.backgroundColor).toBe('var(--levit-bg-yellow, #fef08a)');
    expect(td.style.borderColor).toBe('');
  });

  it('draws no style for a value that is not a color', () => {
    editor = new LevitEditor({ element, initialContent: doc(cell('a', 'r1', 'A', { border: 'red;background:url(x)' })) });
    expect(element.querySelector('td')!.getAttribute('style')).toBeNull();
  });
});

describe('table line colors in HTML and the AI schema', () => {
  it('writes lines that show without Levit, and reads them back', () => {
    const html = documentToHTML(doc(cell('a', 'r1', 'A', { border: 'red' })));
    expect(html).toBe(
      '<table><tbody><tr><td data-border="red" style="border: 1px solid var(--levit-color-red, #b91c1c)">A</td></tr></tbody></table>'
    );
    expect(htmlToDocument(html).blocks[0].attrs?.border).toBe('red');
    const both = documentToHTML(doc(cell('a', 'r1', 'A', { border: '#123456', background: 'green' })));
    expect(htmlToDocument(both).blocks[0].attrs).toMatchObject({ border: '#123456', background: 'green' });
    expect(documentToHTML(doc(cell('a', 'r1', 'A', { border: '"><x' })))).toBe('<table><tbody><tr><td>A</td></tr></tbody></table>');
  });

  it('reads pasted line colors as the nearest named color, and black lines as the default', () => {
    const pasted = htmlToDocument(
      '<table><tr><td style="border: 1px solid #ff0000">A</td><td style="border: 1px solid #000000">B</td></tr></table>'
    );
    expect(pasted.blocks.map((b) => b.attrs?.border)).toEqual(['red', undefined]);
  });

  it('the AI document schema allows line colors, and only valid ones', () => {
    expect(JSON.stringify(getDocumentSchema())).toContain('"border"');
    expect(validateDocument(doc(cell('a', 'r1', 'A', { border: 'red' }))).valid).toBe(true);
    expect(validateDocument(doc(cell('a', 'r1', 'A', { border: 'url(x)' }))).valid).toBe(false);
  });
});

describe('the table color button', () => {
  it('opens a palette with a row for the cell color and a row for the line color', () => {
    make();
    toolbar = createTableToolbar(editor);
    caret('b');
    const button = toolbar.element.querySelector('button[aria-label="Table color"]')!;
    press(button);
    const panel = toolbar.element.querySelector('.levit-color-panel') as HTMLElement;
    expect(Array.from(panel.querySelectorAll('[role="group"]'), (g) => g.getAttribute('aria-label'))).toEqual(['Cell color', 'Line color']);
    const lines = panel.querySelector('[aria-label="Line color"]')!;
    expect(lines.querySelector('button')!.getAttribute('aria-label')).toBe('Default');
    expect(lines.querySelector('input[type="color"]')!.getAttribute('aria-label')).toBe('Other line color');
    expect((lines.querySelector('button[aria-label="Red"]') as HTMLElement).style.borderColor).toBe('var(--levit-color-red, #b91c1c)');

    press(lines.querySelector('button[aria-label="Red"]')!);
    expect(borders()).toEqual(['red', 'red', 'red', 'red']);
    expect(panel.hidden).toBe(true);

    press(button);
    expect(Array.from(lines.querySelectorAll('[aria-pressed="true"]'), (b) => b.getAttribute('aria-label'))).toEqual(['Red']);
    press(lines.querySelector('button[aria-label="Default"]')!);
    expect(borders()).toEqual([null, null, null, null]);
  });

  it('speaks the language of the editor', () => {
    make({ messages: ko });
    toolbar = createTableToolbar(editor);
    caret('b');
    expect(toolbar.element.querySelector('button[aria-label="표 색"]')).not.toBeNull();
    expect(toolbar.element.querySelector('[aria-label="선 색"] button[aria-label="기본"]')).not.toBeNull();
    expect(toolbar.element.querySelector('[aria-label="선 색"] input[aria-label="다른 선 색"]')).not.toBeNull();
  });
});
