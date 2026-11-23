import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { emojiPlugin, findEmoji, DEFAULT_EMOJI } from '../../src/plugins/emoji';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';

let container: HTMLDivElement;
let editor: LevitEditor;

function setup(plugin = emojiPlugin(), blocks = [createBlock('paragraph', {}, [], 'p')]) {
  editor = new LevitEditor({ element: container, initialContent: createDocument(blocks), plugins: [plugin] });
}

const caret = (blockId: string, offset: number) =>
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true }));

function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  container.dispatchEvent(event);
  if (event.defaultPrevented) return;
  if (key === 'Enter') editor.dispatch(editor.state.tr.splitBlock());
  else if (key.length === 1) editor.dispatch(editor.state.tr.insertText(key));
}
const type = (text: string) => [...text].forEach(press);

const menu = () => document.querySelector<HTMLElement>('.levit-emoji-menu')!;
const shown = () => Array.from(menu().querySelectorAll('.levit-autocomplete-title')).map((el) => el.textContent);
const blockText = (i = 0) => getBlockText(editor.state.doc.blocks[i]);
const isOpen = () => editor.container.getAttribute('aria-controls') === menu().id;

beforeEach(() => {
  document.body.textContent = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => editor?.destroy());

describe('findEmoji', () => {
  it('finds names that start with the query first, then names and words that have it', () => {
    const list = [
      { emoji: '😄', name: 'smile', keywords: ['happy'] },
      { emoji: '😺', name: 'smiley_cat' },
      { emoji: '😊', name: 'blush', keywords: ['smile'] },
      { emoji: '🙂', name: 'slightly_smiling_face' },
    ];
    expect(findEmoji(list, 'smi').map((e) => e.name)).toEqual(['smile', 'smiley_cat', 'blush', 'slightly_smiling_face']);
    expect(findEmoji(list, 'HAPPY').map((e) => e.name)).toEqual(['smile']);
    expect(findEmoji(list, 'zzz')).toEqual([]);
  });

  it('has a short built-in list with the everyday ones', () => {
    const names = DEFAULT_EMOJI.map((e) => e.name);
    for (const name of ['smile', 'heart', 'thumbsup', 'tada', 'fire', 'check', 'warning', 'eyes']) expect(names).toContain(name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('emoji plugin', () => {
  it('":" and two letters list the emoji, and picking one puts it in place of what was typed', () => {
    setup(emojiPlugin(), [createBlock('paragraph', {}, [createTextNode('Done ')], 'p')]);
    caret('p', 5);
    type(':t');
    expect(isOpen()).toBe(false);
    type('a');
    expect(isOpen()).toBe(true);
    expect(shown()[0]).toBe('tada');
    expect(menu().querySelector('.levit-autocomplete-icon')!.textContent).toBe('🎉');
    expect(menu().getAttribute('aria-label')).toBe('Emoji');
    press('Enter');
    expect(blockText()).toBe('Done 🎉');
    expect(editor.state.selection.head.offset).toBe(5 + '🎉'.length);
  });

  it('leaves ":" alone in text such as times and smileys', () => {
    setup();
    caret('p', 0);
    type('at 10:30 :) ok');
    expect(blockText()).toBe('at 10:30 :) ok');
    expect(isOpen()).toBe(false);
  });

  it('typing the closing ":" of a known name turns it into the emoji', () => {
    setup();
    caret('p', 0);
    type('nice :fire: ');
    expect(blockText()).toBe('nice 🔥 ');
    // An unknown name stays as typed.
    type(':nothing: ');
    expect(blockText()).toBe('nice 🔥 :nothing: ');
  });

  it('takes the app’s emoji instead of the built-in ones', () => {
    setup(emojiPlugin({ emoji: [{ emoji: '🦄', name: 'unicorn' }] }));
    caret('p', 0);
    type(':un');
    expect(shown()).toEqual(['unicorn']);
    type('icorn:');
    expect(blockText()).toBe('🦄');
  });

  it('keeps the formatting around it', () => {
    setup(emojiPlugin(), [createBlock('paragraph', {}, [{ text: 'Hi ', marks: [{ type: 'bold' }] }], 'p')]);
    caret('p', 3);
    type(':fire:');
    expect(editor.state.doc.blocks[0].content).toEqual([{ text: 'Hi 🔥', marks: [{ type: 'bold' }] }]);
  });

  it('leaves Ctrl and Cmd shortcuts with ":" to the app', () => {
    setup();
    caret('p', 0);
    type('see :fire');
    for (const init of [{ ctrlKey: true, shiftKey: true }, { metaKey: true, shiftKey: true }]) {
      const e = new KeyboardEvent('keydown', { key: ':', ...init, bubbles: true, cancelable: true });
      container.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(blockText()).toBe('see :fire');
  });

  it('finds the app’s emoji whatever the case of their names', () => {
    setup(emojiPlugin({ emoji: [{ emoji: '🦄', name: 'Unicorn', keywords: ['Magic'] }] }));
    caret('p', 0);
    type(':mag');
    expect(shown()).toEqual(['unicorn']);
    press('Escape');
    type(' :Unicorn:');
    expect(blockText()).toBe(':mag 🦄');
  });
});

