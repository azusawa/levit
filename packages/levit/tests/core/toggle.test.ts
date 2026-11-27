import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { isToggleOpen, toggleSummaryLength } from '../../src/core/model/toggle';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import { getDocumentSchema, validateDocument } from '../../src/ai/schema';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { en, ja, ko } from '../../src/i18n/messages';
import type { BlockNode, InlineNode } from '../../src/core/model/types';

const toggle = (id: string, text: string, open = false) =>
  createBlock('toggle_block', open ? { open: true } : {}, [createTextNode(text)], id);
const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);

let element: HTMLDivElement;
let editor: LevitEditor;

function make(blocks: BlockNode[]) {
  editor = new LevitEditor({ element, initialContent: createDocument(blocks) });
}
const caret = (blockId: string, offset: number) =>
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true }));
const summary = () => editor.state.doc.blocks.map((b) => [b.type, getBlockText(b)]);
const enter = () => editor.chain().splitBlock().run();
const el = (id: string) => element.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
const button = (id: string) => el(id).querySelector<HTMLElement>('.levit-toggle-button')!;

beforeEach(() => {
  document.body.textContent = '';
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => editor?.destroy());

describe('toggle model', () => {
  it('is closed unless attrs.open is true, and its first line is the summary', () => {
    expect(isToggleOpen({ attrs: {} })).toBe(false);
    expect(isToggleOpen({ attrs: { open: 'yes' } })).toBe(false);
    expect(isToggleOpen({ attrs: { open: true } })).toBe(true);
    expect(toggleSummaryLength(toggle('t', 'Title\nbody'))).toBe(5);
    expect(toggleSummaryLength(toggle('t', 'Title'))).toBe(5);
  });

  it('has its words in every language', () => {
    for (const m of [en, ko, ja]) {
      for (const key of ['toggle', 'toggleDescription', 'expand', 'collapse'] as const) expect(m[key]).toBeTruthy();
    }
  });
});

describe('toggle in the editor', () => {
  it('draws a button, the summary and the body, and hides the body when closed', () => {
    make([toggle('t', 'Title\nline one\nline two')]);
    const b = button('t');
    expect(b.getAttribute('contenteditable')).toBe('false');
    expect(b.getAttribute('role')).toBe('button');
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.getAttribute('aria-label')).toBe(en.expand);
    expect(el('t').querySelector('.levit-toggle-summary')!.textContent).toBe('Title\n');
    expect(el('t').querySelector('.levit-toggle-body')!.textContent).toBe('line one\nline two');
    expect(el('t').dataset.open).toBe('false');
  });

  it('splits marks that run across the end of the summary', () => {
    const content: InlineNode[] = [{ text: 'Ti', marks: [] }, { text: 'tle\nbo', marks: [{ type: 'bold' }] }, { text: 'dy', marks: [] }];
    make([createBlock('toggle_block', { open: true }, content, 't')]);
    expect(el('t').querySelector('.levit-toggle-summary strong')!.textContent).toBe('tle\n');
    expect(el('t').querySelector('.levit-toggle-body strong')!.textContent).toBe('bo');
  });

  it('puts the caret after the summary at the start of the body', () => {
    make([toggle('t', 'Title\nbody', true)]);
    editor.focus();
    caret('t', 6);
    const range = getSelection()!.getRangeAt(0);
    expect(el('t').querySelector('.levit-toggle-body')!.contains(range.startContainer)).toBe(true);
  });

  it('a press on the button opens and closes it', () => {
    make([toggle('t', 'Title\nbody')]);
    button('t').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(editor.state.doc.blocks[0].attrs).toEqual({ open: true });
    expect(button('t').getAttribute('aria-expanded')).toBe('true');
    expect(button('t').getAttribute('aria-label')).toBe(en.collapse);
    button('t').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(editor.state.doc.blocks[0].attrs).toEqual({});
  });

  it('Mod+Enter opens and closes the toggle at the caret', () => {
    make([toggle('t', 'Title')]);
    caret('t', 2);
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(isToggleOpen(editor.state.doc.blocks[0])).toBe(true);
  });

  it('Enter in an open toggle starts a new body line', () => {
    make([toggle('t', 'Title', true)]);
    caret('t', 5);
    enter();
    expect(summary()).toEqual([['toggle_block', 'Title\n']]);
  });

  it('Enter in the summary of a closed toggle starts a paragraph after it', () => {
    make([toggle('t', 'Title\nbody'), para('p', 'next')]);
    caret('t', 5);
    enter();
    expect(summary()).toEqual([['toggle_block', 'Title\nbody'], ['paragraph', ''], ['paragraph', 'next']]);
    expect(editor.state.selection.head.blockId).toBe(editor.state.doc.blocks[1].id);
  });

  it('Enter on an empty last line leaves it, and in an empty toggle makes a paragraph', () => {
    make([toggle('t', 'Title\nbody\n', true)]);
    caret('t', 11);
    enter();
    expect(summary()).toEqual([['toggle_block', 'Title\nbody'], ['paragraph', '']]);

    editor.destroy();
    make([toggle('t', '', true)]);
    caret('t', 0);
    enter();
    expect(summary()).toEqual([['paragraph', '']]);
    expect(editor.state.doc.blocks[0].attrs).toEqual({});
  });

  it('Backspace at its start turns it into a paragraph and keeps the text', () => {
    make([para('p', 'x'), toggle('t', 'Title\nbody', true)]);
    caret('t', 0);
    editor.chain().deleteBackward().run();
    expect(summary()).toEqual([['paragraph', 'x'], ['paragraph', 'Title\nbody']]);
    expect(editor.state.doc.blocks[1].attrs).toEqual({});
  });

  it('a new toggle starts open, and only open: true is kept', () => {
    make([para('p', 'x')]);
    caret('p', 0);
    editor.chain().setBlockType('toggle_block').run();
    expect(editor.state.doc.blocks[0].attrs).toEqual({ open: true });
    editor.chain().setBlockType('toggle_block', { open: 'no', extra: 1 }).run();
    expect(editor.state.doc.blocks[0].attrs).toEqual({});
  });

  it('clears its state when the element is reused for another block type', () => {
    make([toggle('t', 'Title\nbody', true)]);
    caret('t', 0);
    editor.chain().setBlockType('bullet_list_item').run();
    expect(el('t').hasAttribute('data-open')).toBe(false);
    expect(el('t').querySelector('.levit-toggle-button, .levit-toggle-body')).toBeNull();
  });

  it('the slash menu offers it', () => {
    make([para('p', '')]);
    const menu = createSlashMenu(editor);
    caret('p', 0);
    element.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
    editor.dispatch(editor.state.tr.insertText('/toggle'));
    expect(Array.from(menu.element.querySelectorAll('.levit-slash-title')).map((e) => e.textContent)).toContain(en.toggle);
    menu.destroy();
  });
});

describe('toggle in other formats', () => {
  it('HTML: <details> with <summary>, open or not', () => {
    const html = documentToHTML(createDocument([toggle('t', 'A <b>\nline 1\nline 2', true), toggle('u', 'Only')]));
    expect(html).toBe('<details open><summary>A &lt;b&gt;</summary><p>line 1<br>line 2</p></details><details><summary>Only</summary></details>');
    const back = htmlToDocument(html).blocks;
    expect(back.map((b) => [b.type, b.attrs, getBlockText(b)])).toEqual([
      ['toggle_block', { open: true }, 'A <b>\nline 1\nline 2'],
      ['toggle_block', {}, 'Only'],
    ]);
  });

  it('HTML: paragraphs inside become lines, and other blocks follow the toggle', () => {
    const back = htmlToDocument('<details><summary>S</summary><p>one</p><p>two</p><ul><li>item</li></ul></details>').blocks;
    expect(back.map((b) => [b.type, getBlockText(b)])).toEqual([['toggle_block', 'S\none\ntwo'], ['bullet_list_item', 'item']]);
  });

  it('Markdown: written as <details> and read back with marks, lines and its state', () => {
    const content: InlineNode[] = [{ text: 'Sum', marks: [{ type: 'bold' }] }, { text: '\nline 1\n\nline 3', marks: [] }];
    const doc = createDocument([createBlock('toggle_block', { open: true }, content, 't'), para('p', 'after')]);
    const md = documentToMarkdown(doc);
    expect(md.startsWith('<details open>\n<summary>**Sum**</summary>\nline 1\\\n')).toBe(true);
    const back = markdownToDocument(md).blocks;
    expect(back.map((b) => [b.type, b.attrs, getBlockText(b)])).toEqual([
      ['toggle_block', { open: true }, 'Sum\nline 1\n\nline 3'],
      ['paragraph', {}, 'after'],
    ]);
    expect(back[0].content[0]).toEqual({ text: 'Sum', marks: [{ type: 'bold' }] });
  });

  it('Markdown: a toggle with only a summary, and a body line that reads "</details>"', () => {
    for (const text of ['Only', 'S\n</details>\nmore']) {
      const back = markdownToDocument(documentToMarkdown(createDocument([toggle('t', text)]))).blocks;
      expect(back.map((b) => [b.type, getBlockText(b)])).toEqual([['toggle_block', text]]);
    }
  });

  it('the AI schema and validator know it', () => {
    expect(JSON.stringify(getDocumentSchema())).toContain('"toggle_block"');
    expect(validateDocument(createDocument([toggle('t', 'x', true)])).valid).toBe(true);
    expect(validateDocument(createDocument([createBlock('toggle_block', { open: 'yes' }, [createTextNode('x')])])).valid).toBe(false);
  });
});

describe('toggle review fixes', () => {
  it('Markdown: an empty last body line, a blank one and one ending in "\\" read back', () => {
    for (const text of ['Title\n', 'Title\nfoo\n', 'Title\nfoo\n  ', 'Title\na\\', 'Title\n\\']) {
      const back = markdownToDocument(documentToMarkdown(createDocument([toggle('t', text, true)]))).blocks;
      expect(back.map((b) => [b.type, getBlockText(b)])).toEqual([['toggle_block', text]]);
    }
  });

  it('draws an empty body line, and the caret after the summary goes in it', () => {
    make([toggle('t', 'Title\n', true)]);
    editor.focus();
    caret('t', 6);
    const body = el('t').querySelector('.levit-toggle-body');
    expect(body?.querySelector('br')).not.toBeNull();
    expect(body!.contains(getSelection()!.getRangeAt(0).startContainer)).toBe(true);
  });

  it('closing it with the caret in the body moves the caret to the end of the summary', () => {
    make([toggle('t', 'Title\nbody', true)]);
    caret('t', 8);
    button('t').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(isToggleOpen(editor.state.doc.blocks[0])).toBe(false);
    expect(editor.state.selection.head).toEqual({ blockId: 't', offset: 5 });
  });

  it('Backspace at the start of a paragraph after a closed toggle opens it, so the merged text shows', () => {
    make([toggle('t', 'Title\nbody'), para('p', 'next')]);
    caret('p', 0);
    editor.chain().deleteBackward().run();
    expect(summary()).toEqual([['toggle_block', 'Title\nbodynext']]);
    expect(isToggleOpen(editor.state.doc.blocks[0])).toBe(true);
  });

  it('a click without a press (as a screen reader sends) opens it, and a mouse click does not toggle twice', () => {
    make([toggle('t', 'Title\nbody')]);
    button('t').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(isToggleOpen(editor.state.doc.blocks[0])).toBe(true);
    button('t').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
    button('t').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(isToggleOpen(editor.state.doc.blocks[0])).toBe(false);
  });

  it('does nothing while the editor is not editable', () => {
    make([toggle('t', 'Title\nbody')]);
    editor.setEditable(false);
    button('t').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button('t').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    expect(isToggleOpen(editor.state.doc.blocks[0])).toBe(false);
  });
});
