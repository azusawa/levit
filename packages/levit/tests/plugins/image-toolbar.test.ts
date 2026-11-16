import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { createImageToolbar, type ImageToolbarInstance } from '../../src/plugins/image-toolbar';
import { ja, ko } from '../../src/i18n/messages';

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const img = (id: string, attrs: Record<string, unknown> = {}) =>
  createBlock('image', { src: 'https://x.test/a.png', alt: 'A dot', ...attrs }, [createTextNode('')], id);

let element: HTMLElement;
let editor: LevitEditor;
let toolbar: ImageToolbarInstance;

function make(options: { messages?: typeof ko } = {}) {
  editor = new LevitEditor({
    element,
    messages: options.messages,
    initialContent: { version: 1, blocks: [para('p', 'before'), img('i'), para('q', 'after')] },
  });
  toolbar = createImageToolbar(editor);
}

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
const attrs = () => editor.state.doc.blocks.find((b) => b.id === 'i')?.attrs;
const pressed = () =>
  Array.from(toolbar.element.querySelectorAll('button[aria-pressed="true"]'), (b) => b.getAttribute('aria-label'));
const altField = () => toolbar.element.querySelector<HTMLInputElement>('input')!;

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  toolbar?.destroy();
  editor?.destroy();
  element.remove();
});

describe('image toolbar', () => {
  it('is a labelled toolbar with alt text, sizes, alignments and delete', () => {
    make();
    expect(toolbar.element.getAttribute('role')).toBe('toolbar');
    expect(toolbar.element.getAttribute('aria-label')).toBe('Image tools');
    const labels = Array.from(toolbar.element.querySelectorAll('.levit-image-toolbar-buttons button'), (b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Alt text', 'Small', 'Medium', 'Full width', 'Align left', 'Center', 'Align right', 'Delete image']);
    for (const b of toolbar.element.querySelectorAll('.levit-image-toolbar-buttons button')) expect(b.title).toBe(b.getAttribute('aria-label'));
  });

  it('uses the editor language', () => {
    make({ messages: ko });
    expect(toolbar.element.getAttribute('aria-label')).toBe('이미지 도구');
    expect(button('대체 텍스트')).not.toBeNull();
    expect(button('전체 폭')).not.toBeNull();
    expect(button('이미지 삭제')).not.toBeNull();
    toolbar.destroy();
    editor.destroy();
    make({ messages: ja });
    expect(button('代替テキスト')).not.toBeNull();
  });

  it('shows while an image is selected and hides when the caret leaves it', () => {
    make();
    place('p', 1);
    expect(isShown()).toBe(false);
    place('i');
    expect(isShown()).toBe(true);
    place('q', 0);
    expect(isShown()).toBe(false);
  });

  it('hides when the editor loses focus, but not when focus moves into the toolbar', () => {
    make();
    place('i');
    button('Small').focus();
    expect(isShown()).toBe(true);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    expect(isShown()).toBe(false);
    outside.remove();
  });

  it('hides in an editor that cannot be edited', () => {
    make();
    place('i');
    editor.setEditable(false);
    place('q', 0);
    place('i');
    expect(isShown()).toBe(false);
  });

  it('the size buttons set the size, show it, and a second press goes back to the own size', () => {
    make();
    place('i');
    expect(pressed()).toEqual(['Align left']);
    press(button('Medium'));
    expect(attrs()?.size).toBe('medium');
    expect(pressed()).toEqual(['Medium', 'Align left']);
    press(button('Full width'));
    expect(attrs()?.size).toBe('full');
    press(button('Full width'));
    expect(attrs()?.size).toBeUndefined();
    expect(isShown()).toBe(true);
    expect(editor.state.selection.head.blockId).toBe('i');
  });

  it('the alignment buttons align the image', () => {
    make();
    place('i');
    press(button('Center'));
    expect(attrs()?.align).toBe('center');
    expect(pressed()).toEqual(['Center']);
    press(button('Align right'));
    expect(attrs()?.align).toBe('right');
    press(button('Align left'));
    expect(attrs()?.align).toBeUndefined();
    expect(pressed()).toEqual(['Align left']);
  });

  it('delete removes the image and hides the toolbar', () => {
    make();
    place('i');
    press(button('Delete image'));
    expect(editor.state.doc.blocks.map((b) => b.id)).toEqual(['p', 'q']);
    expect(isShown()).toBe(false);
  });

  it('alt text: the field takes the place of the buttons, Enter saves it and the image stays selected', () => {
    make();
    place('i');
    press(button('Alt text'));
    const field = altField();
    expect(field.getAttribute('aria-label')).toBe('Alt text');
    expect(field.value).toBe('A dot');
    expect(document.activeElement).toBe(field);
    expect((toolbar.element.querySelector('.levit-image-toolbar-buttons') as HTMLElement).hidden).toBe(true);
    expect(isShown()).toBe(true);
    field.value = 'A red dot';
    key(field, 'Enter');
    expect(attrs()?.alt).toBe('A red dot');
    expect((toolbar.element.querySelector('.levit-image-toolbar-buttons') as HTMLElement).hidden).toBe(false);
    expect(editor.hasFocus()).toBe(true);
    expect(editor.state.selection.head.blockId).toBe('i');
  });

  it('alt text: the save button saves too, and Escape leaves it as it was', () => {
    make();
    place('i');
    press(button('Alt text'));
    altField().value = 'Saved';
    press(toolbar.element.querySelector<HTMLButtonElement>('.levit-image-alt-save')!);
    expect(attrs()?.alt).toBe('Saved');
    press(button('Alt text'));
    altField().value = 'Not saved';
    key(altField(), 'Escape');
    expect(attrs()?.alt).toBe('Saved');
    expect(editor.state.selection.head.blockId).toBe('i');
  });

  it('alt text: the field closes when another image or the text is selected', () => {
    make();
    place('i');
    press(button('Alt text'));
    place('q', 1);
    place('i');
    expect(altField().hidden).toBe(true);
    expect((toolbar.element.querySelector('.levit-image-toolbar-buttons') as HTMLElement).hidden).toBe(false);
  });

  it('Alt+F10 on a selected image moves to the toolbar, arrows move, Escape goes back', () => {
    make();
    place('i');
    expect(key(element, 'F10', { altKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button('Alt text'));
    key(button('Alt text'), 'ArrowRight');
    expect(document.activeElement).toBe(button('Small'));
    key(button('Small'), 'Escape');
    expect(editor.hasFocus()).toBe(true);
    expect(editor.state.selection.head.blockId).toBe('i');
  });

  it('Alt+F10 without a selected image is left alone', () => {
    make();
    place('p', 1);
    expect(key(element, 'F10', { altKey: true }).defaultPrevented).toBe(false);
  });

  it('Enter on a focused button runs it, and focus goes back to the editor when the image goes', () => {
    make();
    place('i');
    key(element, 'F10', { altKey: true });
    button('Center').click();
    expect(attrs()?.align).toBe('center');
    button('Delete image').focus();
    button('Delete image').click();
    expect(editor.state.doc.blocks.map((b) => b.id)).toEqual(['p', 'q']);
    expect(editor.hasFocus()).toBe(true);
  });

  it('sits above the image, or below it when there is no room above', () => {
    make();
    const figure = element.querySelector('figure')!;
    const imgEl = figure.querySelector('img')!;
    const rect = (top: number) => ({ top, bottom: top + 100, left: 40, right: 240, width: 200, height: 100, x: 40, y: top, toJSON() {} }) as DOMRect;
    const spy = vi.spyOn(imgEl, 'getBoundingClientRect').mockReturnValue(rect(300));
    vi.spyOn(toolbar.element, 'getBoundingClientRect').mockReturnValue({ height: 36, width: 300 } as DOMRect);
    place('i');
    expect(toolbar.element.style.top).toBe(`${300 - 36 - 8 + window.scrollY}px`);
    expect(toolbar.element.style.left).toBe(`${40 + window.scrollX}px`);
    spy.mockReturnValue(rect(20));
    place('q', 0);
    place('i');
    expect(toolbar.element.style.top).toBe(`${120 + 8 + window.scrollY}px`);
  });

  it('an editor has one toolbar, and destroy removes it', () => {
    make();
    expect(createImageToolbar(editor)).toBe(toolbar);
    expect(document.body.contains(toolbar.element)).toBe(true);
    toolbar.destroy();
    expect(document.body.contains(toolbar.element)).toBe(false);
    expect(createImageToolbar(editor)).not.toBe(toolbar);
  });

  it('goes away with the editor', () => {
    make();
    const el = toolbar.element;
    editor.destroy();
    expect(document.body.contains(el)).toBe(false);
  });

  it('stays inside the window on the right, for a right-aligned image', () => {
    make();
    const imgEl = element.querySelector('figure img')!;
    vi.spyOn(imgEl, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 400, left: window.innerWidth - 100, right: window.innerWidth, width: 100, height: 100 } as DOMRect);
    vi.spyOn(toolbar.element, 'getBoundingClientRect').mockReturnValue({ height: 36, width: 300 } as DOMRect);
    place('i');
    expect(toolbar.element.style.left).toBe(`${window.innerWidth - 300 - 10 + window.scrollX}px`);
  });

  it('its buttons do nothing while the editor is locked, as during an AI answer', () => {
    make();
    place('i');
    editor.setEditable(false);
    press(button('Medium'));
    press(button('Delete image'));
    expect(attrs()).toEqual({ src: 'https://x.test/a.png', alt: 'A dot' });
    expect(isShown()).toBe(false);
  });

  it('saving alt text for an image that went away leaves the caret in the document', () => {
    make();
    place('i');
    press(button('Alt text'));
    // Someone else deletes the image meanwhile.
    const tr = editor.state.tr;
    tr.setSelection({ anchor: { blockId: 'i', offset: 0 }, head: { blockId: 'i', offset: 0 }, isCollapsed: true }).deleteForward();
    editor.dispatch(tr);
    altField().focus();
    key(altField(), 'Enter');
    const ids = editor.state.doc.blocks.map((b) => b.id);
    expect(ids).toContain(editor.state.selection.head.blockId);
  });
});
