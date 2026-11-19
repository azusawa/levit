import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createTextNode } from '../../src/core/model/document';
import { createSearchPanel, type SearchPanelInstance } from '../../src/plugins/search-panel';
import { ko } from '../../src/i18n/messages';

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);

let element: HTMLElement;
let editor: LevitEditor;
let panel: SearchPanelInstance;

function make(options: { messages?: typeof ko; texts?: string[] } = {}) {
  const texts = options.texts ?? ['the cat sat', 'a Cat and a cat'];
  editor = new LevitEditor({
    element,
    messages: options.messages,
    initialContent: { version: 1, blocks: texts.map((t, i) => para(`p${i}`, t)) },
  });
  panel = createSearchPanel(editor);
}

const texts = () => editor.getJSON().blocks.map((b) => b.content.map((n) => n.text).join(''));
const field = (label: string) => panel.element.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
const button = (label: string) => panel.element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const status = () => panel.element.querySelector('[role="status"]')!.textContent;
const key = (target: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const click = (btn: HTMLElement) => btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const select = (blockId: string, from: number, to = from) =>
  editor.dispatch(
    editor.state.tr.setSelection({ anchor: { blockId, offset: from }, head: { blockId, offset: to }, isCollapsed: from === to })
  );

beforeEach(() => {
  element = document.createElement('div');
  document.body.appendChild(element);
});

afterEach(() => {
  panel?.destroy();
  editor?.destroy();
  element.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('search panel', () => {
  it('is a hidden, labelled search box until opened', () => {
    make();
    expect(panel.isOpen).toBe(false);
    expect(panel.element.hidden).toBe(true);
    expect(panel.element.getAttribute('role')).toBe('search');
    expect(panel.element.getAttribute('aria-label')).toBe('Find and replace');
    expect(document.body.contains(panel.element)).toBe(true);
  });

  it('opens with Mod+F in the editor and focuses the find field', () => {
    make();
    editor.focus();
    const e = key(element, 'f', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(panel.isOpen).toBe(true);
    expect(panel.element.hidden).toBe(false);
    expect(document.activeElement).toBe(field('Find'));
  });

  it('starts with the selected text', () => {
    make();
    select('p0', 4, 7);
    panel.open();
    expect(field('Find').value).toBe('cat');
    expect(panel.matches).toHaveLength(3);
  });

  it('counts the matches as the query is typed, ignoring case', () => {
    make();
    panel.open();
    type(field('Find'), 'cat');
    expect(panel.matches).toHaveLength(3);
    expect(status()).toBe('1 of 3');
    type(field('Find'), 'dog');
    expect(panel.current).toBe(-1);
    expect(status()).toBe('No results');
    type(field('Find'), '');
    expect(status()).toBe('');
  });

  it('starts at the first match after the caret', () => {
    make();
    select('p1', 0);
    panel.open();
    type(field('Find'), 'cat');
    expect(panel.current).toBe(1);
    expect(status()).toBe('2 of 3');
  });

  it('moves through the matches with Enter and Shift+Enter, wrapping round', () => {
    make();
    panel.open();
    type(field('Find'), 'cat');
    key(field('Find'), 'Enter');
    expect(panel.current).toBe(1);
    key(field('Find'), 'Enter');
    key(field('Find'), 'Enter');
    expect(panel.current).toBe(0);
    key(field('Find'), 'Enter', { shiftKey: true });
    expect(panel.current).toBe(2);
    click(button('Previous match'));
    expect(panel.current).toBe(1);
    click(button('Next match'));
    expect(panel.current).toBe(2);
  });

  it('does not move on an Enter that ends an IME composition (Safari sends it as keyCode 229)', () => {
    make();
    panel.open();
    type(field('Find'), 'cat');
    key(field('Find'), 'Enter', { isComposing: true });
    key(field('Find'), 'Enter', { keyCode: 229 } as KeyboardEventInit);
    expect(panel.current).toBe(0);
  });

  it('does not start with selected text that holds a line break', () => {
    make({ texts: ['one\ntwo'] });
    select('p0', 0, 7);
    panel.open();
    expect(field('Find').value).toBe('');
  });

  it('matches case when asked', () => {
    make();
    panel.open();
    type(field('Find'), 'Cat');
    const matchCase = button('Match case');
    expect(matchCase.getAttribute('aria-pressed')).toBe('false');
    click(matchCase);
    expect(matchCase.getAttribute('aria-pressed')).toBe('true');
    expect(panel.matches).toEqual([{ blockId: 'p1', from: 2, to: 5, text: 'Cat' }]);
  });

  it('shows the replace field with the toggle or with Mod+Alt+F', () => {
    make();
    panel.open();
    const row = field('Replace with').closest<HTMLElement>('.levit-search-replace')!;
    const toggle = button('Show replace');
    expect(row.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    click(toggle);
    expect(row.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    panel.close();

    editor.focus();
    key(element, 'f', { ctrlKey: true, altKey: true });
    expect(row.hidden).toBe(false);
  });

  it('replaces the current match and goes to the next', () => {
    make();
    panel.open({ replace: true });
    type(field('Find'), 'cat');
    type(field('Replace with'), 'dog');
    click(button('Replace'));
    expect(texts()).toEqual(['the dog sat', 'a Cat and a cat']);
    expect(panel.matches).toHaveLength(2);
    expect(panel.current).toBe(0);
    key(field('Replace with'), 'Enter');
    expect(texts()).toEqual(['the dog sat', 'a dog and a cat']);
  });

  it('replaces all matches, and one undo brings them back', () => {
    make();
    panel.open({ replace: true });
    type(field('Find'), 'cat');
    type(field('Replace with'), 'dog');
    click(button('Replace all'));
    expect(texts()).toEqual(['the dog sat', 'a dog and a dog']);
    expect(status()).toBe('3 replaced');
    editor.undo();
    expect(texts()).toEqual(['the cat sat', 'a Cat and a cat']);
  });

  it('finds again when the document changes', () => {
    make();
    panel.open();
    type(field('Find'), 'cat');
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'p0', offset: 0 }, head: { blockId: 'p0', offset: 0 }, isCollapsed: true }).insertText('cat '));
    expect(panel.matches).toHaveLength(4);
  });

  it('closes with Escape, selecting the current match in the editor', () => {
    make();
    panel.open();
    type(field('Find'), 'cat');
    key(field('Find'), 'Enter');
    key(field('Find'), 'Escape');
    expect(panel.isOpen).toBe(false);
    expect(document.activeElement).toBe(element);
    expect(editor.state.selection).toMatchObject({ anchor: { blockId: 'p1', offset: 2 }, head: { blockId: 'p1', offset: 5 } });
  });

  it('forgets the matches once closed, so nothing stale is replaced', () => {
    make();
    panel.open();
    type(field('Find'), 'cat');
    panel.close();
    expect(panel.matches).toEqual([]);
    expect(panel.current).toBe(-1);
    select('p0', 0);
    editor.chain().insertText('XY').run();
    expect(panel.replaceAll('dog')).toBe(0);
    panel.replace('dog');
    expect(texts()).toEqual(['XYthe cat sat', 'a Cat and a cat']);
  });

  it('scrolls to the current match when moving, not when the document changes elsewhere', () => {
    const scroll = vi.fn();
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scroll);
    make();
    panel.open();
    type(field('Find'), 'cat');
    expect(scroll).toHaveBeenCalled();
    scroll.mockClear();
    select('p1', 15);
    editor.chain().insertText('!').run();
    expect(scroll).not.toHaveBeenCalled();
    panel.next();
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  it('leaves Ctrl+F to the Mac (it moves the caret there); Cmd+F opens the panel', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    make();
    editor.focus();
    const e = key(element, 'f', { ctrlKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(panel.isOpen).toBe(false);
    key(element, 'f', { metaKey: true });
    expect(panel.isOpen).toBe(true);
  });

  it('leaves Mod+F that another handler took, or that comes during an IME composition', () => {
    editor = new LevitEditor({
      element,
      plugins: [{ name: 'own-find', keymap: { 'Mod-f': () => true } }],
      initialContent: { version: 1, blocks: [para('p0', 'cat')] },
    });
    panel = createSearchPanel(editor);
    editor.focus();
    key(element, 'f', { ctrlKey: true });
    expect(panel.isOpen).toBe(false);
    panel.destroy();
    editor.destroy();
    make();
    key(element, 'f', { ctrlKey: true, isComposing: true });
    expect(panel.isOpen).toBe(false);
  });

  it('leaves AltGr keys that type a character (AltGr+F is "[" on a Hungarian keyboard)', () => {
    make();
    editor.focus();
    const e = key(element, '[', { code: 'KeyF', ctrlKey: true, altKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(panel.isOpen).toBe(false);
  });

  it('leaves Cmd+Ctrl+F (full screen) to the Mac', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    make();
    editor.focus();
    const e = key(element, 'f', { metaKey: true, ctrlKey: true });
    expect(e.defaultPrevented).toBe(false);
    expect(panel.isOpen).toBe(false);
  });

  it('keeps the panel open on an Escape that cancels an IME composition', () => {
    make();
    panel.open();
    key(field('Find'), 'Escape', { isComposing: true });
    key(field('Find'), 'Escape', { keyCode: 229 } as KeyboardEventInit);
    expect(panel.isOpen).toBe(true);
  });

  it('scrolls to the next match after its own Replace', () => {
    const scroll = vi.fn();
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scroll);
    make();
    panel.open({ replace: true });
    type(field('Find'), 'cat');
    scroll.mockClear();
    panel.replace('dog');
    expect(scroll).toHaveBeenCalled();
  });

  it('hides replacing once the editor becomes read-only while open', () => {
    make();
    panel.open({ replace: true });
    type(field('Find'), 'cat');
    editor.setEditable(false);
    click(button('Replace all'));
    expect(texts()).toEqual(['the cat sat', 'a Cat and a cat']);
    expect(field('Replace with').closest<HTMLElement>('.levit-search-replace')!.hidden).toBe(true);
    expect(button('Show replace').hidden).toBe(true);
  });

  it('closes with the close button', () => {
    make();
    panel.open();
    click(button('Close'));
    expect(panel.isOpen).toBe(false);
  });

  it('offers no replacing when the editor cannot be edited', () => {
    make();
    editor.setEditable(false);
    panel.open({ replace: true });
    expect(button('Show replace').hidden).toBe(true);
    expect(field('Replace with').closest<HTMLElement>('.levit-search-replace')!.hidden).toBe(true);
    type(field('Find'), 'cat');
    panel.replaceAll('dog');
    expect(texts()).toEqual(['the cat sat', 'a Cat and a cat']);
  });

  it('highlights the matches with the CSS Custom Highlight API when there is one', () => {
    const registry = new Map<string, Set<Range>>();
    class FakeHighlight extends Set<Range> {}
    vi.stubGlobal('Highlight', FakeHighlight);
    vi.stubGlobal('CSS', { escape: CSS.escape, supports: CSS.supports, highlights: registry });
    make();
    panel.open();
    type(field('Find'), 'cat');
    expect(registry.get('levit-search')!.size).toBe(3);
    expect(registry.get('levit-search-current')!.size).toBe(1);
    expect([...registry.get('levit-search-current')!][0].toString()).toBe('cat');
    panel.close();
    expect(registry.get('levit-search')!.size).toBe(0);
    expect(registry.get('levit-search-current')!.size).toBe(0);
  });

  it('uses the editor messages', () => {
    make({ messages: ko });
    panel.open();
    expect(panel.element.getAttribute('aria-label')).toBe('찾기와 바꾸기');
    type(field('찾기'), 'cat');
    expect(status()).toBe('3개 중 1번째');
  });

  it('is made once per editor and removed with it', () => {
    make();
    expect(createSearchPanel(editor)).toBe(panel);
    editor.destroy();
    expect(document.body.contains(panel.element)).toBe(false);
  });
});
