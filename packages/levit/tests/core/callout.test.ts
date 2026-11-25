import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { CALLOUT_KINDS, calloutKind, normalizeCalloutKind } from '../../src/core/model/callout';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import { getDocumentSchema, validateDocument } from '../../src/ai/schema';
import { createBlockHandle } from '../../src/plugins/block-handle';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { en, ja, ko } from '../../src/i18n/messages';

const callout = (id: string, text: string, kind?: string) =>
  createBlock('callout_block', kind ? { kind } : {}, [createTextNode(text)], id);
const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);

let element: HTMLDivElement;
let editor: LevitEditor;

function make(blocks: ReturnType<typeof createBlock>[]) {
  editor = new LevitEditor({ element, initialContent: createDocument(blocks) });
}
const caret = (blockId: string, offset: number) =>
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true }));
const summary = () => editor.state.doc.blocks.map((b) => [b.type, getBlockText(b)]);
const enter = () => editor.chain().splitBlock().run();

beforeEach(() => {
  document.body.textContent = '';
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => editor?.destroy());

describe('callout kinds', () => {
  it('knows the five kinds, and a block without one is a note', () => {
    expect(CALLOUT_KINDS).toEqual(['note', 'tip', 'important', 'warning', 'caution']);
    expect(normalizeCalloutKind('WARNING')).toBe('warning');
    expect(normalizeCalloutKind('"><script>')).toBeNull();
    expect(calloutKind({ attrs: {} })).toBe('note');
    expect(calloutKind({ attrs: { kind: 'nope' } })).toBe('note');
    expect(calloutKind({ attrs: { kind: 'tip' } })).toBe('tip');
  });

  it('has a name for each kind in every language', () => {
    for (const m of [en, ko, ja]) {
      for (const key of ['callout', 'calloutDescription', 'calloutNote', 'calloutTip', 'calloutImportant', 'calloutWarning', 'calloutCaution'] as const) {
        expect(m[key]).toBeTruthy();
      }
    }
  });
});

describe('callout in the editor', () => {
  it('draws its kind, with the name of the kind for screen readers', () => {
    make([callout('c', 'Careful', 'warning')]);
    const el = element.querySelector<HTMLElement>('[data-block-id="c"]')!;
    expect(el.classList.contains('levit-block-callout_block')).toBe(true);
    expect(el.dataset.kind).toBe('warning');
    expect(el.getAttribute('role')).toBe('note');
    expect(el.getAttribute('aria-label')).toBe(en.calloutWarning);
  });

  it('never draws a kind it does not know', () => {
    make([callout('c', 'x', '"><img>')]);
    expect(element.querySelector<HTMLElement>('[data-block-id="c"]')!.dataset.kind).toBe('note');
  });

  it('clears its kind and role when the element is reused for another block type', () => {
    make([callout('c', 'x', 'tip')]);
    caret('c', 0);
    editor.chain().setBlockType('bullet_list_item').run();
    const el = element.querySelector<HTMLElement>('[data-block-id="c"]')!;
    expect(el.hasAttribute('data-kind')).toBe(false);
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.hasAttribute('aria-label')).toBe(false);
  });

  it('"[!warning] " at the start of a line makes a callout of that kind', () => {
    make([para('p', '')]);
    caret('p', 0);
    editor.chain().insertText('[!warning] ').run();
    const block = editor.state.doc.blocks[0];
    expect(block.type).toBe('callout_block');
    expect(block.attrs?.kind).toBe('warning');
    expect(getBlockText(block)).toBe('');
  });

  it('Enter starts a new line inside the callout', () => {
    make([callout('c', 'one')]);
    caret('c', 3);
    enter();
    expect(summary()).toEqual([['callout_block', 'one\n']]);
  });

  it('Enter on an empty last line leaves the callout', () => {
    make([callout('c', 'one\n')]);
    caret('c', 4);
    enter();
    expect(summary()).toEqual([['callout_block', 'one'], ['paragraph', '']]);
    expect(editor.state.selection.head.blockId).toBe(editor.state.doc.blocks[1].id);
  });

  it('Enter in an empty callout turns it into a paragraph', () => {
    make([callout('c', '', 'tip')]);
    caret('c', 0);
    enter();
    expect(summary()).toEqual([['paragraph', '']]);
    expect(editor.state.doc.blocks[0].attrs?.kind).toBeUndefined();
  });

  it('Backspace at its start turns it into a paragraph and keeps the text', () => {
    make([para('p', 'before'), callout('c', 'body', 'caution')]);
    caret('c', 0);
    editor.chain().deleteBackward().run();
    expect(summary()).toEqual([['paragraph', 'before'], ['paragraph', 'body']]);
    expect(editor.state.doc.blocks[1].attrs?.kind).toBeUndefined();
  });

  it('the slash menu offers it', () => {
    make([para('p', '')]);
    const menu = createSlashMenu(editor);
    caret('p', 0);
    element.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
    editor.dispatch(editor.state.tr.insertText('/'));
    editor.dispatch(editor.state.tr.insertText('callout_block'));
    expect(Array.from(menu.element.querySelectorAll('.levit-slash-title')).map((el) => el.textContent)).toContain(en.callout);
    menu.destroy();
  });

  it('the block menu turns a block into a callout and changes its kind', () => {
    make([callout('c', 'x', 'tip')]);
    const handle = createBlockHandle(editor);
    caret('c', 0);
    element.querySelector('[data-block-id="c"]')!.getBoundingClientRect = () => new DOMRect(60, 100, 500, 20);
    element.getBoundingClientRect = () => new DOMRect(40, 100, 600, 20);
    document.elementFromPoint = () => element.querySelector('[data-block-id="c"]');
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 100, clientY: 110 }));
    const button = handle.element.querySelector('button')!;
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 30, clientY: 110, button: 0 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 30, clientY: 110, button: 0 }));
    button.click();
    const entry = (label: string) => Array.from(handle.menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')).find((el) => el.textContent === label)!;
    expect(entry(en.calloutTip).getAttribute('aria-checked')).toBe('true');
    entry(en.calloutCaution).click();
    expect(editor.state.doc.blocks[0].attrs?.kind).toBe('caution');
    handle.destroy();
  });
});

describe('callout in other formats', () => {
  it('Markdown: written and read as a GitHub alert', () => {
    const doc = createDocument([callout('c', 'Mind the gap', 'warning')]);
    const md = documentToMarkdown(doc);
    expect(md).toBe('> [!WARNING]\n> Mind the gap');
    const back = markdownToDocument(md).blocks[0];
    expect(back.type).toBe('callout_block');
    expect(back.attrs?.kind).toBe('warning');
    expect(getBlockText(back)).toBe('Mind the gap');
  });

  it('Markdown: keeps lines, and a plain quote stays a quote', () => {
    const md = documentToMarkdown(createDocument([callout('c', 'one\ntwo', 'tip')]));
    expect(getBlockText(markdownToDocument(md).blocks[0])).toBe('one\ntwo');
    expect(markdownToDocument('> [!NOPE]\n> text').blocks[0].type).toBe('blockquote');
    expect(markdownToDocument('> plain').blocks[0].type).toBe('blockquote');
  });

  it('HTML: written and read back with its kind', () => {
    const html = documentToHTML(createDocument([callout('c', '<b>', 'important')]));
    expect(html).toBe('<aside data-callout="important">&lt;b&gt;</aside>');
    const back = htmlToDocument(html).blocks[0];
    expect(back.type).toBe('callout_block');
    expect(back.attrs?.kind).toBe('important');
    expect(getBlockText(back)).toBe('<b>');
  });

  it('HTML: a kind it does not know is written as a note, and a plain aside is not a callout', () => {
    expect(documentToHTML(createDocument([callout('c', 'x', '"><img src=x>')]))).toBe('<aside data-callout="note">x</aside>');
    expect(htmlToDocument('<aside>plain</aside>').blocks[0].type).toBe('paragraph');
  });

  it('HTML: paragraphs inside keep the kind, and an empty callout survives', () => {
    const blocks = htmlToDocument('<aside data-callout="tip"><p>one</p><p>two</p></aside>').blocks;
    expect(blocks.map((b) => [b.type, b.attrs?.kind, getBlockText(b)])).toEqual([['callout_block', 'tip', 'one'], ['callout_block', 'tip', 'two']]);
    const empty = htmlToDocument(documentToHTML(createDocument([callout('c', '', 'tip')]))).blocks[0];
    expect([empty.type, empty.attrs?.kind]).toEqual(['callout_block', 'tip']);
  });

  it('Markdown: an empty callout survives, and a quote of the words "[!NOTE]" stays a quote', () => {
    const empty = markdownToDocument(documentToMarkdown(createDocument([callout('c', '', 'tip')]))).blocks[0];
    expect([empty.type, empty.attrs?.kind, getBlockText(empty)]).toEqual(['callout_block', 'tip', '']);
    const quote = createDocument([createBlock('blockquote', {}, [createTextNode('[!NOTE]')], 'q')]);
    const back = markdownToDocument(documentToMarkdown(quote)).blocks[0];
    expect([back.type, getBlockText(back)]).toEqual(['blockquote', '[!NOTE]']);
  });

  it('leaves the block type "callout" to plugins, as apps already use it', () => {
    const plugin = { name: 'mine', blocks: [{ type: 'callout', tag: 'section' }] };
    make([createBlock('callout', {}, [createTextNode('x')], 'c')]);
    editor.destroy();
    editor = new LevitEditor({ element, plugins: [plugin], initialContent: createDocument([createBlock('callout', {}, [createTextNode('x')], 'c')]) });
    expect(element.querySelector('[data-block-id="c"]')!.tagName).toBe('SECTION');
  });

  it('the AI schema and validator know it', () => {
    expect(JSON.stringify(getDocumentSchema())).toContain('"callout_block"');
    const ok = createDocument([callout('c', 'x', 'tip')]);
    expect(validateDocument(ok).valid).toBe(true);
    expect(validateDocument(createDocument([callout('c', 'x', 'loud')])).valid).toBe(false);
  });
});
