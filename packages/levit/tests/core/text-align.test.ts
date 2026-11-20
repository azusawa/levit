import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { normalizeTextAlign, canAlignText } from '../../src/core/model/align';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown } from '../../src/serializers/markdown';
import { getDocumentSchema, validateDocument } from '../../src/ai/schema';
import type { BlockNode } from '../../src/core/model/types';

const para = (id: string, text: string, attrs: Record<string, unknown> = {}) =>
  createBlock('paragraph', attrs, [createTextNode(text)], id);
const heading = (id: string, text: string, attrs: Record<string, unknown> = {}) =>
  createBlock('heading', { level: 2, ...attrs }, [createTextNode(text)], id);
const bullet = (id: string, text: string) => createBlock('bullet_list_item', {}, [createTextNode(text)], id);
const code = (id: string, text: string) => createBlock('code_block', {}, [createTextNode(text)], id);
const caret = (blockId: string, offset = 0) => ({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true });
const range = (from: string, to: string) => ({
  anchor: { blockId: from, offset: 0 },
  head: { blockId: to, offset: 1 },
  isCollapsed: false,
});

let element: HTMLElement;
let editor: LevitEditor;

function make(blocks: BlockNode[]) {
  editor = new LevitEditor({ element, initialContent: createDocument(blocks) });
  editor.focus();
}
const put = (blockId: string, offset = 0) => editor.dispatch(editor.state.tr.setSelection(caret(blockId, offset)));
const attrs = (id: string) => editor.state.doc.blocks.find((b) => b.id === id)!.attrs;
const blockEl = (id: string) => element.querySelector(`[data-block-id="${id}"]`) as HTMLElement;
function key(name: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  editor?.destroy();
  element.remove();
});

describe('text alignment values', () => {
  it('keeps center, right and justify; left and anything else are the default', () => {
    expect(normalizeTextAlign('center')).toBe('center');
    expect(normalizeTextAlign('right')).toBe('right');
    expect(normalizeTextAlign('justify')).toBe('justify');
    expect(normalizeTextAlign('left')).toBeNull();
    expect(normalizeTextAlign('middle')).toBeNull();
    expect(normalizeTextAlign(undefined)).toBeNull();
  });

  it('paragraphs, headings and quotes can be aligned; other blocks cannot', () => {
    expect(['paragraph', 'heading', 'blockquote'].every(canAlignText)).toBe(true);
    expect(['code_block', 'bullet_list_item', 'table_cell', 'image'].some(canAlignText)).toBe(false);
  });
});

describe('setTextAlign', () => {
  it('aligns the block with the caret, and left takes the alignment off', () => {
    make([para('a', 'one'), para('b', 'two')]);
    put('a', 1);
    editor.chain().setTextAlign('center').run();
    expect(attrs('a')).toEqual({ align: 'center' });
    expect(attrs('b')).toEqual({});
    expect(editor.getTextAlign()).toBe('center');
    editor.chain().setTextAlign('left').run();
    expect(attrs('a')).toEqual({});
    expect(editor.getTextAlign()).toBe('left');
  });

  it('aligns every selected block that can be aligned, and keeps their other attrs', () => {
    make([heading('h', 'title'), bullet('l', 'item'), code('c', 'x = 1'), para('p', 'text')]);
    editor.dispatch(editor.state.tr.setSelection(range('h', 'p')));
    editor.chain().setTextAlign('right').run();
    expect(attrs('h')).toEqual({ level: 2, align: 'right' });
    expect(attrs('l')).toEqual({});
    expect(attrs('c')).toEqual({});
    expect(attrs('p')).toEqual({ align: 'right' });
  });

  it('is one undo step, and does nothing when nothing changes or the value is unknown', () => {
    make([para('a', 'one', { align: 'justify' }), bullet('l', 'item')]);
    let updates = 0;
    editor.on('update', () => (updates += 1));
    put('a');
    editor.chain().setTextAlign('justify').run();
    editor.chain().setTextAlign('middle' as any).run();
    put('l');
    editor.chain().setTextAlign('center').run();
    expect(updates).toBe(0);
    expect(editor.getTextAlign()).toBeNull();
    put('a');
    editor.chain().setTextAlign('right').run();
    editor.undo();
    expect(attrs('a')).toEqual({ align: 'justify' });
  });

  it('Enter carries the alignment to the new line', () => {
    make([heading('h', 'title', { align: 'center' })]);
    put('h', 5);
    editor.chain().splitBlock().run();
    const next = editor.state.doc.blocks[1];
    expect(next.type).toBe('paragraph');
    expect(next.attrs).toEqual({ align: 'center' });
  });

  it('turning a paragraph into a heading or quote keeps its alignment; into a list drops it', () => {
    make([para('a', 'one', { align: 'right' }), para('b', 'two', { align: 'center' })]);
    put('a');
    editor.chain().setHeading(1).run();
    expect(attrs('a')).toEqual({ level: 1, align: 'right' });
    put('b');
    editor.chain().setBlockType('bullet_list_item').run();
    expect(attrs('b')).toEqual({});
  });
});

describe('alignment through other edits (review)', () => {
  it('text pasted or streamed into an empty aligned line keeps its alignment', () => {
    make([para('a', '', { align: 'center' }), para('b', '', { align: 'right' })]);
    put('a');
    editor.chain().insertFragment([para('x', 'hello')]).run();
    expect(attrs('a')).toEqual({ align: 'center' });
    put('b');
    editor.chain().insertFragment([para('y', 'one'), para('z', 'two')]).run();
    expect(attrs('b')).toEqual({ align: 'right' });
    // A pasted block with its own alignment brings it.
    make([para('c', '', { align: 'center' })]);
    put('c');
    editor.chain().insertFragment([para('w', 'hi', { align: 'justify' })]).run();
    expect(attrs('c')).toEqual({ align: 'justify' });
  });

  it('Backspace that turns the first heading into a paragraph keeps its alignment', () => {
    make([heading('h', 'Title', { align: 'center' })]);
    put('h', 0);
    editor.chain().deleteBackward().run();
    expect(editor.state.doc.blocks[0].type).toBe('paragraph');
    expect(attrs('h')).toEqual({ align: 'center' });
  });

  it("'left' clears an alignment value Levit does not know", () => {
    make([para('a', 'one', { align: 'left' }), para('b', 'two', { align: 'start' })]);
    editor.dispatch(editor.state.tr.setSelection(range('a', 'b')));
    editor.chain().setTextAlign('left').run();
    expect([attrs('a'), attrs('b')]).toEqual([{}, {}]);
  });

  it('a selection reads as one alignment only when all its alignable lines share it', () => {
    make([para('a', 'one', { align: 'center' }), bullet('l', 'item'), para('b', 'two', { align: 'center' }), para('c', 'three')]);
    editor.dispatch(editor.state.tr.setSelection(range('a', 'b')));
    expect(editor.getTextAlign()).toBe('center');
    expect(editor.canSetTextAlign()).toBe(true);
    editor.dispatch(editor.state.tr.setSelection(range('a', 'c')));
    expect(editor.getTextAlign()).toBeNull();
    expect(editor.canSetTextAlign()).toBe(true);
    put('l');
    expect(editor.canSetTextAlign()).toBe(false);
  });

  it('the shortcut works when the selection ends in a list but starts in a paragraph', () => {
    make([para('a', 'one'), bullet('l', 'item')]);
    editor.dispatch(editor.state.tr.setSelection(range('a', 'l')));
    expect(key('E', { ctrlKey: true, shiftKey: true, code: 'KeyE' }).defaultPrevented).toBe(true);
    expect(attrs('a')).toEqual({ align: 'center' });
  });
});

describe('drawing the alignment', () => {
  it('sets text-align on the block, and clears it', () => {
    make([para('a', 'one', { align: 'justify' }), para('b', 'two')]);
    expect(blockEl('a').style.textAlign).toBe('justify');
    expect(blockEl('b').style.textAlign).toBe('');
    put('a');
    editor.chain().setTextAlign('left').run();
    expect(blockEl('a').style.textAlign).toBe('');
    expect(blockEl('a').hasAttribute('style')).toBe(false);
  });

  it('ignores an alignment on a block that cannot have one', () => {
    make([createBlock('bullet_list_item', { align: 'center' }, [createTextNode('x')], 'l')]);
    expect(blockEl('l').style.textAlign).toBe('');
  });
});

describe('alignment shortcuts', () => {
  it('Mod+Shift+L, E, R and J align left, center, right and justify', () => {
    make([para('a', 'one')]);
    put('a', 1);
    const ctrl = { ctrlKey: true, shiftKey: true };
    expect(key('E', { ...ctrl, code: 'KeyE' }).defaultPrevented).toBe(true);
    expect(attrs('a')).toEqual({ align: 'center' });
    key('R', { ...ctrl, code: 'KeyR' });
    expect(attrs('a')).toEqual({ align: 'right' });
    key('J', { ...ctrl, code: 'KeyJ' });
    expect(attrs('a')).toEqual({ align: 'justify' });
    key('L', { ...ctrl, code: 'KeyL' });
    expect(attrs('a')).toEqual({});
  });

  it('leaves the keys alone outside a block that can be aligned, and when read-only', () => {
    make([code('c', 'x'), para('a', 'one')]);
    put('c');
    expect(key('E', { ctrlKey: true, shiftKey: true, code: 'KeyE' }).defaultPrevented).toBe(false);
    put('a');
    editor.setEditable(false);
    key('E', { ctrlKey: true, shiftKey: true, code: 'KeyE' });
    expect(attrs('a')).toEqual({});
  });

  it('the browser alignment commands (formatJustify*) align too', () => {
    make([para('a', 'one')]);
    put('a', 1);
    const input = (inputType: string) =>
      element.dispatchEvent(new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true }));
    input('formatJustifyCenter');
    expect(attrs('a')).toEqual({ align: 'center' });
    input('formatJustifyFull');
    expect(attrs('a')).toEqual({ align: 'justify' });
    input('formatJustifyRight');
    expect(attrs('a')).toEqual({ align: 'right' });
    input('formatJustifyLeft');
    expect(attrs('a')).toEqual({});
  });
});

describe('alignment in HTML, Markdown and the AI schema', () => {
  it('writes text-align and reads it back', () => {
    const doc = createDocument([
      para('a', 'one', { align: 'center' }),
      heading('h', 'two', { align: 'right' }),
      createBlock('blockquote', { align: 'justify' }, [createTextNode('three')], 'q'),
      para('b', 'four'),
    ]);
    const html = documentToHTML(doc);
    expect(html).toBe(
      '<p style="text-align: center">one</p><h2 style="text-align: right">two</h2>' +
        '<blockquote style="text-align: justify">three</blockquote><p>four</p>'
    );
    expect(htmlToDocument(html).blocks.map((b) => b.attrs)).toEqual([
      { align: 'center' },
      { level: 2, align: 'right' },
      { align: 'justify' },
      {},
    ]);
  });

  it('reads alignment pasted from other editors: style, align attribute, or a centered container', () => {
    const doc = htmlToDocument(
      '<p style="margin: 0; TEXT-ALIGN:Center;">a</p><p align="right">b</p><p style="text-align: left">c</p>' +
        '<div style="text-align: justify"><p>d</p>e</div><p style="text-align: start">f</p>' +
        '<ul><li style="text-align: center">g</li></ul>'
    );
    expect(doc.blocks.map((b) => [b.type, b.attrs])).toEqual([
      ['paragraph', { align: 'center' }],
      ['paragraph', { align: 'right' }],
      ['paragraph', {}],
      ['paragraph', { align: 'justify' }],
      ['paragraph', { align: 'justify' }],
      ['paragraph', {}],
      ['bullet_list_item', {}],
    ]);
  });

  it('reads the values browsers write when copying, and leaves inherit to the container', () => {
    const doc = htmlToDocument(
      '<p style="text-align: -webkit-center">a</p><p style="text-align: -webkit-right">b</p><p style="text-align: end">c</p>' +
        '<div style="text-align: center"><p style="text-align: inherit">d</p></div><center>e</center>'
    );
    expect(doc.blocks.map((b) => b.attrs)).toEqual([
      { align: 'center' },
      { align: 'right' },
      { align: 'right' },
      { align: 'center' },
      { align: 'center' },
    ]);
  });

  it('Markdown has no alignment, so the text is written as it is', () => {
    const doc = createDocument([para('a', 'one', { align: 'center' })]);
    expect(documentToMarkdown(doc).trim()).toBe('one');
  });

  it('the AI schema allows an alignment on paragraphs, headings and quotes', () => {
    const schema = JSON.stringify(getDocumentSchema());
    expect(schema).toContain('justify');
    const ok = {
      version: 1,
      blocks: [
        { id: 'a', type: 'paragraph', attrs: { align: 'center' }, content: [{ text: 'x' }] },
        { id: 'b', type: 'heading', attrs: { level: 1, align: 'right' }, content: [{ text: 'y' }] },
        { id: 'c', type: 'blockquote', attrs: { align: 'justify' }, content: [{ text: 'z' }] },
      ],
    };
    expect(validateDocument(ok).valid).toBe(true);
    const bad = { version: 1, blocks: [{ id: 'a', type: 'paragraph', attrs: { align: 'middle' }, content: [{ text: 'x' }] }] };
    expect(validateDocument(bad).valid).toBe(false);
  });
});
