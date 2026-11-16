import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { domSelectionToEditorSelection, restoreDOMSelection } from '../../src/core/view/selection';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown } from '../../src/serializers/markdown';
import { getDocumentSchema, validateDocument } from '../../src/ai/schema';
import type { BlockNode, DocumentData } from '../../src/core/model/types';

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const hr = (id: string) => createBlock('horizontal_rule', {}, [createTextNode('')], id);
const img = (id: string, attrs: Record<string, unknown> = {}) =>
  createBlock('image', { src: 'https://x.test/a.png', alt: 'A', ...attrs }, [createTextNode('')], id);
const caret = (blockId: string, offset = 0) => ({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true });

let element: HTMLElement;
let editor: LevitEditor;

function make(blocks: BlockNode[]) {
  editor = new LevitEditor({ element, initialContent: createDocument(blocks) });
  editor.focus();
}
const put = (blockId: string, offset = 0) => editor.dispatch(editor.state.tr.setSelection(caret(blockId, offset)));
const head = () => [editor.state.selection.head.blockId, editor.state.selection.head.offset, editor.state.selection.isCollapsed];
const figure = (id: string) => element.querySelector(`[data-block-id="${id}"]`) as HTMLElement;
const image = (id: string) => editor.state.doc.blocks.find((b) => b.id === id)!.attrs;
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

describe('selecting an image', () => {
  it('the browser selection goes around the selected image, and reads back as the image', () => {
    make([para('a', 'one'), img('i'), para('b', 'two')]);
    put('i');
    const range = getSelection()!.getRangeAt(0);
    expect([range.startContainer, range.startOffset, range.endContainer, range.endOffset]).toEqual([element, 1, element, 2]);
    expect(domSelectionToEditorSelection(element)).toEqual(caret('i'));
    // A keydown reads the DOM selection first: the image stays selected.
    key('Shift');
    expect(head()).toEqual(['i', 0, true]);
  });

  it('marks the selected image, also after it is drawn again, and unmarks it when the caret leaves', () => {
    make([para('a', 'one'), img('i'), para('b', 'two')]);
    put('i');
    expect(figure('i').hasAttribute('data-selected')).toBe(true);
    expect(element.classList.contains('levit-image-selected')).toBe(true);
    editor.chain().updateImage({ size: 'small' }).run();
    expect(figure('i').hasAttribute('data-selected')).toBe(true);
    put('b', 1);
    expect(figure('i').hasAttribute('data-selected')).toBe(false);
    expect(element.classList.contains('levit-image-selected')).toBe(false);
    put('i');
    editor.destroy();
    expect(element.classList.contains('levit-image-selected')).toBe(false);
  });

  it('a press on an image selects it and keeps the focus in the editor', () => {
    make([para('a', 'one'), img('i'), para('b', 'two')]);
    put('a', 1);
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    figure('i').querySelector('img')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(head()).toEqual(['i', 0, true]);
    expect(editor.hasFocus()).toBe(true);
  });

  it('a press on an image does nothing while the editor cannot be edited', () => {
    make([para('a', 'one'), img('i')]);
    put('a', 1);
    editor.setEditable(false);
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    figure('i').querySelector('img')!.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(head()).toEqual(['a', 1, true]);
  });

  it('the left and right arrows stop on an image next to the caret', () => {
    make([para('a', 'one'), img('i'), para('b', 'two')]);
    put('b', 0);
    expect(key('ArrowLeft').defaultPrevented).toBe(true);
    expect(head()).toEqual(['i', 0, true]);
    put('a', 3);
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(head()).toEqual(['i', 0, true]);
  });

  it('from a selected image, the arrows go to the text before and after it', () => {
    make([para('a', 'one'), img('i'), para('b', 'two')]);
    put('i');
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(head()).toEqual(['b', 0, true]);
    put('i');
    key('ArrowDown');
    expect(head()).toEqual(['b', 0, true]);
    put('i');
    key('ArrowLeft');
    expect(head()).toEqual(['a', 3, true]);
    put('i');
    key('ArrowUp');
    expect(head()).toEqual(['a', 3, true]);
  });

  it('the arrows step from image to image and over dividers, and stay put at the ends', () => {
    make([img('i'), hr('h'), img('j')]);
    put('i');
    key('ArrowRight');
    expect(head()).toEqual(['j', 0, true]);
    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(head()).toEqual(['j', 0, true]);
    key('ArrowLeft');
    expect(head()).toEqual(['i', 0, true]);
    key('ArrowLeft');
    expect(head()).toEqual(['i', 0, true]);
  });

  it('leaves arrows with Shift or in the middle of text to the browser', () => {
    make([para('a', 'one'), img('i'), para('b', 'two')]);
    put('b', 1);
    expect(key('ArrowLeft').defaultPrevented).toBe(false);
    put('b', 0);
    expect(key('ArrowLeft', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(head()).toEqual(['b', 0, true]);
  });
});

describe('image size, alignment and alt text', () => {
  it('updateImage changes the selected image, and null or left takes a setting off', () => {
    make([para('a', 'one'), img('i')]);
    put('i');
    editor.chain().updateImage({ size: 'medium', align: 'center', alt: 'A cat' }).run();
    expect(image('i')).toEqual({ src: 'https://x.test/a.png', alt: 'A cat', size: 'medium', align: 'center' });
    expect(editor.getSelectedImage()).toEqual({ src: 'https://x.test/a.png', alt: 'A cat', size: 'medium', align: 'center' });
    editor.chain().updateImage({ size: null, align: 'left' }).run();
    expect(image('i')).toEqual({ src: 'https://x.test/a.png', alt: 'A cat' });
    expect(editor.getSelectedImage()).toEqual({ src: 'https://x.test/a.png', alt: 'A cat', size: null, align: 'left' });
  });

  it('ignores values it does not know, and does nothing without a selected image', () => {
    make([para('a', 'one'), img('i')]);
    put('i');
    editor.chain().updateImage({ size: 'huge' as any, align: 'middle' as any, alt: 3 as any }).run();
    expect(image('i')).toEqual({ src: 'https://x.test/a.png', alt: 'A' });
    put('a', 1);
    expect(editor.getSelectedImage()).toBeNull();
    let updates = 0;
    editor.on('update', () => (updates += 1));
    editor.chain().updateImage({ size: 'small' }).run();
    expect(updates).toBe(0);
    put('i');
    editor.chain().updateImage({ size: null, align: 'left', alt: 'A' }).run();
    expect(updates).toBe(0);
  });

  it('draws the size and alignment on the figure, and clears them', () => {
    make([para('a', 'one'), img('i', { size: 'small', align: 'right' })]);
    expect(figure('i').dataset.size).toBe('small');
    expect(figure('i').dataset.align).toBe('right');
    put('i');
    editor.chain().updateImage({ size: null, align: null }).run();
    expect(figure('i').hasAttribute('data-size')).toBe(false);
    expect(figure('i').hasAttribute('data-align')).toBe(false);
  });

  it('draws nothing for values it does not know', () => {
    make([img('i', { size: 'x" onerror="1', align: 'justify' })]);
    expect(figure('i').hasAttribute('data-size')).toBe(false);
    expect(figure('i').hasAttribute('data-align')).toBe(false);
  });
});

describe('image settings in HTML, Markdown and the AI schema', () => {
  const doc = (...blocks: BlockNode[]): DocumentData => ({ version: 1, blocks });

  it('HTML keeps the size and alignment, in a way that shows without Levit', () => {
    const html = documentToHTML(doc(img('i', { size: 'medium', align: 'center' })));
    expect(html).toBe(
      '<img src="https://x.test/a.png" alt="A" data-size="medium" data-align="center" style="display: block; width: 50%; margin-left: auto; margin-right: auto">'
    );
    expect(htmlToDocument(html).blocks[0].attrs).toEqual({ src: 'https://x.test/a.png', alt: 'A', size: 'medium', align: 'center' });
    expect(documentToHTML(doc(img('i', { size: 'small', align: 'right' })))).toContain('width: 25%; margin-left: auto');
    expect(documentToHTML(doc(img('i', { size: 'full' })))).toContain('style="display: block; width: 100%"');
    expect(documentToHTML(doc(img('i')))).toBe('<img src="https://x.test/a.png" alt="A">');
    expect(documentToHTML(doc(img('i', { size: '"><x', align: '"><x' })))).toBe('<img src="https://x.test/a.png" alt="A">');
    expect(htmlToDocument('<img src="a.png" data-size="huge" data-align="x">').blocks[0].attrs).toEqual({ src: 'a.png', alt: '' });
  });

  it('Markdown has no way to write them and keeps the image', () => {
    expect(documentToMarkdown(doc(img('i', { size: 'small', align: 'center' })))).toBe('![A](https://x.test/a.png)');
  });

  it('the AI document schema allows them, and only the known values', () => {
    expect(JSON.stringify(getDocumentSchema())).toContain('"medium"');
    expect(validateDocument(doc(img('i', { size: 'full', align: 'right' }))).valid).toBe(true);
    expect(validateDocument(doc(img('i', { size: 'huge' }))).valid).toBe(false);
    expect(validateDocument(doc(img('i', { align: 'justify' }))).valid).toBe(false);
  });
});
