import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createAutocomplete, type AutocompleteInstance, type AutocompleteItem, type AutocompleteOptions } from '../../src/plugins/autocomplete';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';

let container: HTMLDivElement;
let editor: LevitEditor;
let popup: AutocompleteInstance;

const fruits: AutocompleteItem[] = [
  { id: 'apple', title: 'Apple' },
  { id: 'apricot', title: 'Apricot' },
  { id: 'banana', title: 'Banana', description: 'Yellow', icon: '🍌' },
];

function setup(options: Partial<AutocompleteOptions<AutocompleteItem>> = {}, blocks = [createBlock('paragraph', {}, [], 'p')]) {
  popup?.destroy();
  editor?.destroy();
  container.textContent = '';
  editor = new LevitEditor({ element: container, initialContent: createDocument(blocks) });
  const onSelect = vi.fn();
  popup = createAutocomplete(editor, {
    char: '@',
    label: 'People',
    items: (query) => fruits.filter((f) => f.title.toLowerCase().startsWith(query.toLowerCase())),
    onSelect,
    ...options,
  });
  return onSelect;
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

const isOpen = () => popup.isOpen();
const shown = () => Array.from(popup.element.querySelectorAll('.levit-autocomplete-title')).map((el) => el.textContent);
const blockText = (i = 0) => getBlockText(editor.state.doc.blocks[i]);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.textContent = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  popup?.destroy();
  editor?.destroy();
});

describe('autocomplete popup', () => {
  it('opens on its character at the start of a line or after a space, with the items for what follows', () => {
    setup();
    caret('p', 0);
    type('@');
    expect(isOpen()).toBe(true);
    expect(shown()).toEqual(['Apple', 'Apricot', 'Banana']);
    type('ap');
    expect(shown()).toEqual(['Apple', 'Apricot']);
    expect(popup.element.getAttribute('role')).toBe('listbox');
    expect(popup.element.getAttribute('aria-label')).toBe('People');
    expect(container.getAttribute('aria-controls')).toBe(popup.element.id);
    expect(container.getAttribute('aria-activedescendant')).toBe(`${popup.element.id}-0`);
  });

  it('stays closed inside a word, as in an email address', () => {
    setup();
    caret('p', 0);
    type('me@example');
    expect(isOpen()).toBe(false);
  });

  it('Enter or Tab picks the highlighted item, with the range of what was typed', () => {
    const onSelect = setup({}, [createBlock('paragraph', {}, [createTextNode('Hi ')], 'p')]);
    caret('p', 3);
    type('@ap');
    press('ArrowDown');
    expect(container.getAttribute('aria-activedescendant')).toBe(`${popup.element.id}-1`);
    press('Enter');
    expect(onSelect).toHaveBeenCalledWith(fruits[1], { from: { blockId: 'p', offset: 3 }, to: { blockId: 'p', offset: 6 } });
    expect(isOpen()).toBe(false);
    // The text is the app's to change: Enter did not split the line.
    expect(editor.state.doc.blocks).toHaveLength(1);

    type(' @b');
    press('Tab');
    expect(onSelect).toHaveBeenLastCalledWith(fruits[2], { from: { blockId: 'p', offset: 7 }, to: { blockId: 'p', offset: 9 } });
  });

  it('the arrows wrap around, and Escape closes it', () => {
    setup();
    caret('p', 0);
    type('@');
    press('ArrowUp');
    expect(container.getAttribute('aria-activedescendant')).toBe(`${popup.element.id}-2`);
    press('Escape');
    expect(isOpen()).toBe(false);
    expect(container.hasAttribute('aria-controls')).toBe(false);
    expect(blockText()).toBe('@');
  });

  it('closes when nothing matches, and Enter then splits the line as usual', () => {
    setup();
    caret('p', 0);
    type('@zz');
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks).toHaveLength(2);
  });

  it('closes when the character is deleted', () => {
    setup();
    caret('p', 0);
    type('@a');
    press('Backspace');
    expect(isOpen()).toBe(true);
    press('Backspace');
    expect(isOpen()).toBe(false);
  });

  it('closes on a space, unless spaces are allowed; a space right after the character always closes it', () => {
    setup();
    caret('p', 0);
    type('@a ');
    expect(isOpen()).toBe(false);

    setup({ allowSpaces: true, items: () => fruits });
    caret('p', 0);
    type('@a b');
    expect(isOpen()).toBe(true);

    setup({ allowSpaces: true, items: () => fruits });
    caret('p', 0);
    type('@ ');
    expect(isOpen()).toBe(false);
  });

  it('a mouse press on an item picks it', () => {
    const onSelect = setup();
    caret('p', 0);
    type('@b');
    const item = popup.element.querySelector('[role="option"]')!;
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(onSelect).toHaveBeenCalledWith(fruits[2], expect.anything());
  });

  it('draws the icon, title and description of an item as text only', () => {
    setup({ items: () => [{ id: 'x', title: '<b>x</b>', description: '<i>d</i>', icon: '<img>' }] });
    caret('p', 0);
    type('@');
    expect(popup.element.querySelector('b, i, img')).toBeNull();
    expect(popup.element.querySelector('.levit-autocomplete-desc')!.textContent).toBe('<i>d</i>');
    expect(popup.element.querySelector('.levit-autocomplete-icon')!.textContent).toBe('<img>');
  });

  it('waits for items that come later, and keeps only the answer for the latest query', async () => {
    let answer: (items: AutocompleteItem[]) => void = () => {};
    const slow = new Promise<AutocompleteItem[]>((resolve) => (answer = resolve));
    setup({ items: (query) => (query === 'a' ? slow : Promise.resolve(fruits.slice(2))) });
    caret('p', 0);
    type('@a');
    press('Backspace');
    type('b');
    await flush();
    expect(shown()).toEqual(['Banana']);
    answer(fruits.slice(0, 1));
    await flush();
    expect(shown()).toEqual(['Banana']);
  });

  it('shows nothing and leaves the keys alone until enough is typed', () => {
    setup({ minQuery: 2, items: () => fruits });
    caret('p', 0);
    type('@a');
    expect(isOpen()).toBe(false);
    press('Enter');
    expect(editor.state.doc.blocks).toHaveLength(2);
    caret(editor.state.doc.blocks[1].id, 0);
    type('@ap');
    expect(isOpen()).toBe(true);
  });

  it('stays closed in a code block', () => {
    setup({}, [createBlock('code_block', {}, [], 'c')]);
    caret('c', 0);
    type('@');
    expect(isOpen()).toBe(false);
  });

  it('two popups on one editor keep to their own character and their own pointers', () => {
    setup();
    const other = createAutocomplete(editor, { char: ':', label: 'Emoji', items: () => fruits, onSelect: () => {} });
    caret('p', 0);
    type(':');
    expect(other.isOpen()).toBe(true);
    expect(isOpen()).toBe(false);
    other.close();
    type(' @');
    expect(isOpen()).toBe(true);
    other.close();
    // Closing the other one does not take the editor's pointers from this one.
    expect(container.getAttribute('aria-controls')).toBe(popup.element.id);
    other.destroy();
  });

  it('closes when the editor loses focus, and destroy takes it away', () => {
    setup();
    caret('p', 0);
    type('@');
    container.dispatchEvent(new FocusEvent('blur'));
    expect(isOpen()).toBe(false);
    popup.destroy();
    expect(document.querySelector('.levit-autocomplete-menu')).toBeNull();
  });

  it('opens for a character typed with Option on a Mac or AltGr, but not for Ctrl or Cmd shortcuts', () => {
    setup();
    caret('p', 0);
    container.dispatchEvent(new KeyboardEvent('keydown', { key: '@', altKey: true, bubbles: true, cancelable: true }));
    editor.dispatch(editor.state.tr.insertText('@'));
    expect(isOpen()).toBe(true);
    press('Escape');
    type(' ');
    for (const init of [{ ctrlKey: true }, { metaKey: true }]) {
      container.dispatchEvent(new KeyboardEvent('keydown', { key: '@', ...init, bubbles: true, cancelable: true }));
      editor.dispatch(editor.state.tr.insertText('@'));
      expect(isOpen()).toBe(false);
      type(' ');
    }
  });

  it('Enter while newer items are on the way picks from them, not from the old list', async () => {
    const onSelect = setup({ items: (query) => Promise.resolve(query === 'k' ? [fruits[0], fruits[1]] : [fruits[1]]) });
    caret('p', 0);
    type('@k');
    await flush();
    type('i');
    press('Enter');
    // The key is taken, and the pick waits for the answer.
    expect(editor.state.doc.blocks).toHaveLength(1);
    expect(onSelect).not.toHaveBeenCalled();
    await flush();
    expect(onSelect).toHaveBeenCalledWith(fruits[1], expect.anything());
  });

  it('Tab can be left to the editor', () => {
    const onSelect = setup({ selectOnTab: false });
    caret('p', 0);
    type('@');
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    container.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps the highlighted entry in view', () => {
    const seen = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      seen(this.id);
    };
    try {
      setup();
      caret('p', 0);
      type('@');
      press('ArrowDown');
      expect(seen).toHaveBeenLastCalledWith(`${popup.element.id}-1`);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

