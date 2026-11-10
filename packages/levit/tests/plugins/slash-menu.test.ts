import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createSlashMenu, type SlashMenuInstance } from '../../src/plugins/slash-menu';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';

let container: HTMLDivElement;
let editor: LevitEditor;
let menu: SlashMenuInstance;

function setup(blocks = [createBlock('paragraph', {}, [], 'p')]) {
  editor = new LevitEditor({ element: container, initialContent: createDocument(blocks) });
  menu = createSlashMenu(editor);
}

const caret = (blockId: string, offset: number) =>
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true }));

/** A key press as the browser sends it: keydown first, then the text goes in unless the key was taken. */
function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  container.dispatchEvent(event);
  if (event.defaultPrevented) return;
  if (key === 'Enter') editor.dispatch(editor.state.tr.splitBlock());
  else if (key === 'Backspace') editor.chain().deleteBackward().run();
  else if (key.length === 1) editor.dispatch(editor.state.tr.insertText(key));
}
const type = (text: string) => [...text].forEach(press);

const isOpen = () => container.getAttribute('aria-controls') === menu.element.id;
const shown = () => Array.from(menu.element.querySelectorAll('.levit-slash-title')).map((el) => el.textContent);
const blockText = (i = 0) => getBlockText(editor.state.doc.blocks[i]);

beforeEach(() => {
  document.body.textContent = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  menu?.destroy();
  editor?.destroy();
});

describe('slash menu: when it opens', () => {
  it('opens on "/" at the start of a line', () => {
    setup();
    caret('p', 0);
    type('/');
    expect(isOpen()).toBe(true);
    expect(shown()).toContain('Heading 1');
  });

  it('opens on "/" after a space', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Hello')], 'p')]);
    caret('p', 5);
    type(' /');
    expect(isOpen()).toBe(true);
  });

  it('stays closed for "/" inside a word or a link', () => {
    setup();
    caret('p', 0);
    type('and/or https://x');
    expect(isOpen()).toBe(false);
    expect(blockText()).toBe('and/or https://x');
  });

  it('stays closed in a code block, where "/" is part of the code', () => {
    setup([createBlock('code_block', {}, [], 'c')]);
    caret('c', 0);
    type('/');
    expect(isOpen()).toBe(false);
  });
});

describe('slash menu: typing after "/"', () => {
  it('narrows the list to the entries that match', () => {
    setup();
    caret('p', 0);
    type('/head');
    expect(isOpen()).toBe(true);
    expect(shown()).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
    type('ing 2');
    expect(shown()).toEqual(['Heading 2']);
  });

  it('closes when nothing matches, and Enter then splits the line as usual', () => {
    setup();
    caret('p', 0);
    type('/zzz');
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks).toHaveLength(2);
    expect(blockText(0)).toBe('/zzz');
  });

  it('choosing an entry removes the "/" and what was typed after it, and keeps the rest', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Intro')], 'p')]);
    caret('p', 5);
    type(' /quo');
    expect(shown()).toEqual(['Quote']);
    press('Enter');
    expect(isOpen()).toBe(false);
    expect(editor.state.doc.blocks[0].type).toBe('blockquote');
    expect(blockText()).toBe('Intro ');
  });

  it('closes when the "/" is deleted', () => {
    setup();
    caret('p', 0);
    type('/h');
    press('Backspace');
    expect(isOpen()).toBe(true);
    press('Backspace');
    expect(isOpen()).toBe(false);
    expect(blockText()).toBe('');
  });
});

describe('slash menu: never takes text it did not see typed', () => {
  it('stays closed for Mod+/ and other shortcuts, which type nothing', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Hello world')], 'p')]);
    caret('p', 6);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: '/', metaKey: true, bubbles: true, cancelable: true }));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks.map((b) => getBlockText(b))).toEqual(['Hello ', 'world']);
  });

  it('closes when undo takes the "/" away', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Intro')], 'p')]);
    caret('p', 5);
    type(' ');
    type('/he');
    expect(isOpen()).toBe(true);
    while (blockText().includes('/')) editor.undo();
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks.map((b) => getBlockText(b))[0]).toMatch(/^Intro/);
  });

  it('closes when the caret moves before the "/", also without a transaction (arrow keys, clicks)', () => {
    setup([createBlock('paragraph', {}, [createTextNode('Intro ')], 'p')]);
    caret('p', 6);
    type('/he');
    editor.setSelectionQuietly({ anchor: { blockId: 'p', offset: 2 }, head: { blockId: 'p', offset: 2 }, isCollapsed: true });
    expect(isOpen()).toBe(false);
  });

  it('closes when a space follows the "/", as in "red / blue"', () => {
    setup();
    caret('p', 0);
    type('red / b');
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks.map((b) => getBlockText(b))).toEqual(['red / b', '']);
  });

  it('leaves Enter and the arrows to the IME while it is composing', () => {
    setup();
    caret('p', 0);
    type('/');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    // happy-dom leaves isComposing out of the event init.
    Object.defineProperty(enter, 'isComposing', { value: true });
    container.dispatchEvent(enter);
    // The menu chose nothing: the line is still a paragraph holding the "/".
    expect(editor.state.doc.blocks[0].type).toBe('paragraph');
    expect(blockText()).toBe('/');
  });
});

describe('slash menu: closing', () => {
  it('closes when the caret moves to another line', () => {
    setup([createBlock('paragraph', {}, [], 'p'), createBlock('paragraph', {}, [createTextNode('x')], 'q')]);
    caret('p', 0);
    type('/');
    caret('q', 1);
    expect(isOpen()).toBe(false);
  });

  it('closes when the editor loses focus', () => {
    setup();
    caret('p', 0);
    type('/');
    container.dispatchEvent(new FocusEvent('blur'));
    expect(isOpen()).toBe(false);
  });

  it('closes on a click outside it, but not on a click on an entry', () => {
    setup();
    caret('p', 0);
    type('/');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(isOpen()).toBe(false);

    press('Backspace');
    type('/');
    expect(isOpen()).toBe(true);
    menu.element.querySelectorAll('.levit-slash-item')[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(editor.state.doc.blocks[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
  });
});
