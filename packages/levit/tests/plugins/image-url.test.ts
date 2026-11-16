import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { createSlashMenu, type SlashMenuInstance } from '../../src/plugins/slash-menu';
import { ko } from '../../src/i18n/messages';

let element: HTMLElement;
let editor: LevitEditor;
let menu: SlashMenuInstance;

function make(options: { messages?: typeof ko } = {}) {
  editor = new LevitEditor({
    element,
    messages: options.messages,
    initialContent: { version: 1, blocks: [createBlock('paragraph', {}, [createTextNode('one')], 'a'), createBlock('paragraph', {}, [createTextNode('')], 'b')] },
  });
  menu = createSlashMenu(editor);
  editor.focus();
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'b', offset: 0 }, head: { blockId: 'b', offset: 0 }, isCollapsed: true }));
  menu.getItems().find((i) => i.id === 'image')!.action(editor);
}

const box = () => document.querySelector<HTMLElement>('.levit-image-url')!;
const field = () => box().querySelector('input')!;
const insertButton = () => box().querySelector('button')!;
const key = (k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  field().dispatchEvent(e);
  return e;
};
const types = () => editor.state.doc.blocks.map((b) => b.type);

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  menu?.destroy();
  editor?.destroy();
  element.remove();
});

describe('the image URL field', () => {
  it('opens under the line with the focus in a labelled field', () => {
    make();
    expect(box().style.display).not.toBe('none');
    expect(box().getAttribute('role')).toBe('group');
    expect(field().getAttribute('aria-label')).toBe('Image URL');
    expect(field().placeholder).toBe('https://');
    expect(insertButton().textContent).toBe('Insert');
    expect(document.activeElement).toBe(field());
  });

  it('Enter inserts the image where the caret was, and the focus goes back to the editor', () => {
    make();
    field().value = '  https://x.test/a.png ';
    expect(key('Enter').defaultPrevented).toBe(true);
    expect(types()).toEqual(['paragraph', 'image', 'paragraph']);
    expect(editor.state.doc.blocks[1].attrs?.src).toBe('https://x.test/a.png');
    expect(box().style.display).toBe('none');
    expect(editor.hasFocus()).toBe(true);
  });

  it('the Insert button inserts too', () => {
    make();
    field().value = 'https://x.test/a.png';
    insertButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(types()).toEqual(['paragraph', 'image', 'paragraph']);
  });

  it('a URL that is not a safe image stays in the field, marked', () => {
    make();
    field().value = 'javascript:alert(1)';
    key('Enter');
    expect(types()).toEqual(['paragraph', 'paragraph']);
    expect(field().getAttribute('aria-invalid')).toBe('true');
    expect(box().style.display).not.toBe('none');
    field().value = 'https://x.test/a.png';
    field().dispatchEvent(new Event('input', { bubbles: true }));
    expect(field().hasAttribute('aria-invalid')).toBe(false);
  });

  it('Enter in an empty field, or Escape, closes it and changes nothing', () => {
    make();
    key('Enter');
    expect(box().style.display).toBe('none');
    expect(types()).toEqual(['paragraph', 'paragraph']);
    menu.getItems().find((i) => i.id === 'image')!.action(editor);
    field().value = 'https://x.test/a.png';
    key('Escape');
    expect(box().style.display).toBe('none');
    expect(types()).toEqual(['paragraph', 'paragraph']);
    expect(editor.hasFocus()).toBe(true);
    expect(editor.state.selection.head).toEqual({ blockId: 'b', offset: 0 });
  });

  it('closes when the focus goes elsewhere', () => {
    make();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(box().style.display).toBe('none');
    outside.remove();
  });

  it('opens empty each time', () => {
    make();
    field().value = 'javascript:x';
    key('Enter');
    key('Escape');
    menu.getItems().find((i) => i.id === 'image')!.action(editor);
    expect(field().value).toBe('');
    expect(field().hasAttribute('aria-invalid')).toBe(false);
  });

  it('speaks the language of the editor', () => {
    make({ messages: ko });
    expect(field().getAttribute('aria-label')).toBe('이미지 URL');
    expect(insertButton().textContent).toBe('넣기');
  });

  it('goes away with the menu', () => {
    make();
    menu.destroy();
    expect(document.querySelector('.levit-image-url')).toBeNull();
  });
});
