import { describe, it, expect, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { ko } from '../../src/i18n/messages';

let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((f) => f());
  cleanup = [];
});

function setup(options: { messages?: typeof ko } = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const editor = new LevitEditor({
    element: el,
    messages: options.messages,
    initialContent: createDocument([createBlock('paragraph', {}, [createTextNode('hello')], 'p')]),
  });
  const menu = createBubbleMenu(editor);
  editor.focus();
  editor.dispatch(
    editor.state.tr.setSelection({ anchor: { blockId: 'p', offset: 0 }, head: { blockId: 'p', offset: 5 }, isCollapsed: false })
  );
  cleanup.push(() => {
    menu.destroy();
    editor.destroy();
    el.remove();
  });
  const q = <T extends Element = HTMLButtonElement>(selector: string) => menu.element.querySelector(selector) as T;
  return { editor, menu, q };
}

const press = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
const marks = (editor: LevitEditor) => editor.state.doc.blocks[0].content.map((n) => n.marks);

describe('the color button in the bubble menu', () => {
  it('opens the palette in place of the buttons', () => {
    const { q } = setup();
    const button = q('button[aria-label="Color"]');
    expect(button.getAttribute('aria-haspopup')).toBe('true');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const panel = q<HTMLElement>('.levit-color-panel');
    expect(panel.hidden).toBe(true);

    press(button);
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(q<HTMLElement>('.levit-bubble-buttons').hidden).toBe(true);

    const groups = Array.from(panel.querySelectorAll('[role="group"]'), (g) => g.getAttribute('aria-label'));
    expect(groups).toEqual(['Text color', 'Highlight color']);
    const text = Array.from(panel.querySelectorAll('[aria-label="Text color"] button'), (b) => b.getAttribute('aria-label'));
    expect(text).toEqual(['Default', 'Gray', 'Brown', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Pink', 'Red']);
    const background = Array.from(panel.querySelectorAll('[aria-label="Highlight color"] button'), (b) => b.getAttribute('aria-label'));
    expect(background[0]).toBe('No highlight');
    expect(panel.querySelector('input[type="color"][aria-label="Other text color"]')).not.toBeNull();
    expect(panel.querySelector('input[type="color"][aria-label="Other highlight color"]')).not.toBeNull();
  });

  it('colors the selected text and closes', () => {
    const { editor, q } = setup();
    press(q('button[aria-label="Color"]'));
    press(q('[aria-label="Text color"] button[aria-label="Red"]'));
    expect(marks(editor)).toEqual([[{ type: 'color', attrs: { color: 'red' } }]]);
    expect(q<HTMLElement>('.levit-color-panel').hidden).toBe(true);
    expect(q<HTMLElement>('.levit-bubble-buttons').hidden).toBe(false);
  });

  it('highlights in a color, and takes colors off', () => {
    const { editor, q } = setup();
    press(q('button[aria-label="Color"]'));
    press(q('[aria-label="Highlight color"] button[aria-label="Blue"]'));
    expect(marks(editor)).toEqual([[{ type: 'highlight', attrs: { color: 'blue' } }]]);
    press(q('button[aria-label="Color"]'));
    press(q('[aria-label="Text color"] button[aria-label="Green"]'));
    press(q('button[aria-label="Color"]'));
    press(q('button[aria-label="No highlight"]'));
    press(q('button[aria-label="Color"]'));
    press(q('button[aria-label="Default"]'));
    expect(marks(editor)).toEqual([[]]);
  });

  it('marks the colors the selection has', () => {
    const { editor, q } = setup();
    editor.chain().setColor('red').setHighlight('pink').run();
    press(q('button[aria-label="Color"]'));
    const pressed = Array.from(q<HTMLElement>('.levit-color-panel').querySelectorAll('button[aria-pressed="true"]'), (b) =>
      b.getAttribute('aria-label')
    );
    expect(pressed).toEqual(['Red', 'Pink']);
  });

  it('shows each color in its swatch', () => {
    const { q } = setup();
    expect(q<HTMLElement>('[aria-label="Text color"] button[aria-label="Red"]').style.color).toBe('var(--levit-color-red, #b91c1c)');
    expect(q<HTMLElement>('[aria-label="Highlight color"] button[aria-label="Red"]').style.backgroundColor).toBe(
      'var(--levit-bg-red, #fee2e2)'
    );
  });

  it('colors the text it was opened for with a color from the picker', () => {
    const { editor, q } = setup();
    press(q('button[aria-label="Color"]'));
    const picker = q<HTMLInputElement>('input[aria-label="Other text color"]');
    // The picker takes focus, and the selection in the text may go.
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'p', offset: 1 }, head: { blockId: 'p', offset: 1 }, isCollapsed: true }));
    picker.value = '#123456';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    expect(marks(editor)).toEqual([[{ type: 'color', attrs: { color: '#123456' } }]]);
    expect(q<HTMLElement>('.levit-color-panel').hidden).toBe(true);
  });

  it('starts the picker at the color the text has', () => {
    const { editor, q } = setup();
    editor.chain().setHighlight('#abcdef').run();
    press(q('button[aria-label="Color"]'));
    expect(q<HTMLInputElement>('input[aria-label="Other highlight color"]').value).toBe('#abcdef');
  });

  it('moves between swatches with the arrow keys, and Escape goes back to the buttons', () => {
    const { q } = setup();
    const button = q('button[aria-label="Color"]');
    button.focus();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    const panel = q<HTMLElement>('.levit-color-panel');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Default');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Brown');
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('speaks the language of the editor', () => {
    const { q } = setup({ messages: ko });
    expect(q('button[aria-label="색"]')).not.toBeNull();
    expect(q('[aria-label="글자색"] button[aria-label="빨강"]')).not.toBeNull();
    expect(q('[aria-label="형광펜 색"] button[aria-label="형광펜 없음"]')).not.toBeNull();
  });
});
