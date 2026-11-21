import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlockHandle, type BlockHandleInstance } from '../../src/plugins/block-handle';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { createCell } from '../../src/core/model/table';
import type { BlockNode } from '../../src/core/model/types';

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const cell = (id: string, text: string, row: string) => ({ ...createCell('t', row), id, content: [createTextNode(text)] });

/** Each top-level element of the editor is 20px high, one under the other, from y = 100. */
const ROW = 20;
const TOP = 100;

let element: HTMLElement;
let editor: LevitEditor;
let handle: BlockHandleInstance;

function make(blocks: BlockNode[]) {
  editor = new LevitEditor({ element, initialContent: createDocument(blocks) });
  handle = createBlockHandle(editor);
  editor.focus();
}

function rectOf(el: Element): DOMRect {
  const top = Array.from(element.children).indexOf(el as HTMLElement);
  if (el === element) return new DOMRect(40, TOP, 600, ROW * element.children.length);
  if (top === -1) return new DOMRect(0, 0, 0, 0);
  return new DOMRect(60, TOP + top * ROW, 560, ROW);
}

const ids = () => editor.state.doc.blocks.map((b) => b.id);
const texts = () => editor.state.doc.blocks.map((b) => getBlockText(b));
const button = () => handle.element.querySelector('button')!;
const menu = () => handle.menu;
const items = () => Array.from(menu().querySelectorAll<HTMLElement>('[role^="menuitem"]'));
const item = (label: string) => items().find((el) => el.textContent === label)!;
/** The y in the middle of the nth top-level element. */
const yOf = (n: number) => TOP + n * ROW + ROW / 2;

function pointer(type: string, target: EventTarget, y: number, x = 30) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  target.dispatchEvent(e);
  return e;
}
const hover = (n: number) => pointer('mousemove', element.children[n], yOf(n), 100);
function press(target: Element) {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
}
function key(target: Element, name: string) {
  const e = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}
const shown = (el: HTMLElement) => el.style.display !== 'none';

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return rectOf(this);
  });
});

afterEach(() => {
  handle?.destroy();
  editor?.destroy();
  element.remove();
  vi.restoreAllMocks();
});

describe('block handle', () => {
  it('shows next to the block under the mouse, and hides while typing or when the editor is locked', () => {
    make([para('a', 'one'), para('b', 'two')]);
    expect(shown(handle.element)).toBe(false);
    hover(1);
    expect(shown(handle.element)).toBe(true);
    expect(handle.element.style.top).toBe(`${TOP + ROW}px`);
    expect(button().getAttribute('aria-label')).toBe('Block menu');
    key(element, 'x');
    expect(shown(handle.element)).toBe(false);
    editor.setEditable(false);
    hover(0);
    expect(shown(handle.element)).toBe(false);
  });

  it('opens the block menu on a click, with the block type checked, and turns the block into another type', () => {
    make([para('a', 'one'), para('b', 'two')]);
    hover(1);
    pointer('pointerdown', button(), yOf(1));
    pointer('pointerup', button(), yOf(1));
    expect(shown(menu())).toBe(true);
    expect(menu().getAttribute('role')).toBe('menu');
    expect(button().getAttribute('aria-expanded')).toBe('true');
    expect(item('Text').getAttribute('aria-checked')).toBe('true');
    expect(item('Heading 1').getAttribute('aria-checked')).toBe('false');
    pointer('mousedown', item('Heading 1'), 0);
    pointer('click', item('Heading 1'), 0);
    expect(editor.state.doc.blocks[1]).toMatchObject({ id: 'b', type: 'heading', attrs: { level: 1 } });
    expect(editor.state.doc.blocks[0].type).toBe('paragraph');
    expect(shown(menu())).toBe(false);
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });

  it('moves, duplicates and deletes the block from the menu', () => {
    make([para('a', 'one'), para('b', 'two'), para('c', 'three')]);
    const run = (n: number, label: string) => {
      hover(n);
      press(button());
      press(item(label));
    };
    run(0, 'Move down');
    expect(ids()).toEqual(['b', 'a', 'c']);
    run(2, 'Move up');
    expect(ids()).toEqual(['b', 'c', 'a']);
    run(0, 'Duplicate');
    expect(texts()).toEqual(['two', 'two', 'three', 'one']);
    run(3, 'Delete');
    expect(texts()).toEqual(['two', 'two', 'three']);
  });

  it('puts the caret at the end of the block it acts on, when the caret was elsewhere', () => {
    make([para('a', 'one'), para('b', 'two')]);
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'b', offset: 1 }, head: { blockId: 'b', offset: 1 }, isCollapsed: true }));
    hover(0);
    press(button());
    press(item('Duplicate'));
    const copy = editor.state.doc.blocks[1];
    expect(editor.state.selection.head).toEqual({ blockId: copy.id, offset: 3 });
  });

  it('a table has no Turn into entries but can be moved, duplicated and deleted', () => {
    make([para('a', 'one'), cell('t1', 'A', 'r1'), cell('t2', 'B', 'r1')]);
    hover(1);
    press(button());
    expect(items().map((el) => el.textContent)).toEqual(['Move up', 'Move down', 'Duplicate', 'Delete']);
    press(item('Move up'));
    expect(ids()).toEqual(['t1', 't2', 'a']);
  });

  it('drags the block to where it is dropped, showing where it will go', () => {
    make([para('a', 'one'), para('b', 'two'), para('c', 'three')]);
    hover(0);
    pointer('pointerdown', button(), yOf(0));
    // Into the lower half of the last block: after it.
    pointer('pointermove', button(), yOf(2) + 5);
    const line = document.querySelector<HTMLElement>('.levit-block-drop-indicator')!;
    expect(shown(line)).toBe(true);
    expect(line.style.top).toBe(`${TOP + 3 * ROW}px`);
    expect(element.children[0].classList.contains('is-dragging')).toBe(true);
    pointer('pointerup', button(), yOf(2) + 5);
    expect(ids()).toEqual(['b', 'c', 'a']);
    expect(shown(line)).toBe(false);
    expect(shown(menu())).toBe(false);
    expect(element.querySelector('.is-dragging')).toBeNull();
    // One undo puts it back.
    editor.undo();
    expect(ids()).toEqual(['a', 'b', 'c']);
  });

  it('Escape cancels a drag', () => {
    make([para('a', 'one'), para('b', 'two')]);
    hover(0);
    pointer('pointerdown', button(), yOf(0));
    pointer('pointermove', button(), yOf(1) + 5);
    key(document.body, 'Escape');
    pointer('pointerup', button(), yOf(1) + 5);
    expect(ids()).toEqual(['a', 'b']);
    expect(element.querySelector('.is-dragging')).toBeNull();
  });

  it('works from the keyboard: arrows move between entries, Escape closes and goes back to the text', () => {
    make([para('a', 'one'), para('b', 'two')]);
    hover(0);
    press(button());
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], 'ArrowUp');
    key(items()[0], 'ArrowUp');
    expect(document.activeElement).toBe(items()[items().length - 1]);
    key(document.activeElement!, 'Escape');
    expect(shown(menu())).toBe(false);
    expect(document.activeElement).toBe(element);
  });

  it('acts on all selected blocks when the handle is on one of them', () => {
    make([para('a', 'one'), para('b', 'two'), para('c', 'three')]);
    editor.dispatch(
      editor.state.tr.setSelection({ anchor: { blockId: 'a', offset: 0 }, head: { blockId: 'b', offset: 1 }, isCollapsed: false })
    );
    hover(1);
    press(button());
    press(item('Quote'));
    expect(editor.state.doc.blocks.map((b) => b.type)).toEqual(['blockquote', 'blockquote', 'paragraph']);
  });

  it('an editor has one handle, and destroy takes it away', () => {
    make([para('a', 'one')]);
    expect(createBlockHandle(editor)).toBe(handle);
    handle.destroy();
    expect(document.querySelector('.levit-block-handle')).toBeNull();
    expect(document.querySelector('.levit-block-menu')).toBeNull();
    expect(document.querySelector('.levit-block-drop-indicator')).toBeNull();
  });
});
