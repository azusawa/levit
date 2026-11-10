import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { ja, ko } from '../../src/i18n/messages';
import type { LevitEditorElement } from '../../src/ui/web-component';
import '../../src/ui/web-component';

beforeEach(() => {
  document.body.textContent = '';
});

function mount(attrs: Record<string, string> = {}): LevitEditorElement {
  const el = document.createElement('levit-editor') as LevitEditorElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

const menus = () => ({
  slash: document.querySelectorAll('.levit-slash-menu').length,
  bubble: document.querySelectorAll('.levit-bubble-menu').length,
});

describe('<levit-editor>', () => {
  it('comes with the slash and bubble menus, like the React and Vue components', () => {
    mount();
    expect(menus()).toEqual({ slash: 1, bubble: 1 });
  });

  it('slash-menu="false" and bubble-menu="false" leave them out', () => {
    mount({ 'slash-menu': 'false', 'bubble-menu': 'false' });
    expect(menus()).toEqual({ slash: 0, bubble: 0 });
  });

  it('removes its menus when it is removed', async () => {
    const el = mount();
    el.remove();
    await Promise.resolve();
    expect(menus()).toEqual({ slash: 0, bubble: 0 });
  });

  it('follows a later change of lang, keeping the text', () => {
    const el = mount({ lang: 'ko', value: 'Hello' });
    expect(el.editor.messages.bold).toBe(ko.bold);
    el.setAttribute('lang', 'ja');
    expect(el.editor.messages.bold).toBe(ja.bold);
    expect(el.getText()).toBe('Hello');
    expect(el.editor.container.getAttribute('data-placeholder')).toBe(ja.placeholder);
    expect(menus()).toEqual({ slash: 1, bubble: 1 });
  });

  it('keeps working, with its text, when it is moved to another place in the page', () => {
    const el = mount({ value: 'Moved text' });
    const other = document.createElement('section');
    document.body.appendChild(other);
    other.appendChild(el);
    expect(el.getText()).toBe('Moved text');
    expect(el.querySelectorAll('.levit-editor-root')).toHaveLength(1);
    el.editor.chain().selectAll().insertText('Still editable').run();
    expect(el.getText()).toBe('Still editable');
    expect(menus()).toEqual({ slash: 1, bubble: 1 });
  });

  it('keeps the same editor when moved, with what was attached to it', async () => {
    const el = mount({ value: 'x' });
    const editor = el.editor;
    const onUpdate = vi.fn();
    editor.on('update', onUpdate);
    document.body.appendChild(document.createElement('section')).appendChild(el);
    await Promise.resolve();
    expect(el.editor).toBe(editor);
    editor.chain().insertText('!').run();
    expect(onUpdate).toHaveBeenCalled();
  });

  it('still gives its document after it is removed', async () => {
    const el = mount({ value: 'Keep me' });
    el.remove();
    await Promise.resolve();
    expect(el.getText()).toBe('Keep me');
    expect(el.getJSON().blocks[0].content[0].text).toBe('Keep me');
    expect(JSON.parse(el.value).blocks).toHaveLength(1);
  });

  it('a new lang does not fire input, and a lang with the same messages keeps the editor', () => {
    const el = mount({ lang: 'ko', value: 'x' });
    const input = vi.fn();
    el.addEventListener('input', input);
    const editor = el.editor;
    el.setAttribute('lang', 'ko-KR');
    expect(el.editor).toBe(editor);
    el.setAttribute('lang', 'ja');
    expect(input).not.toHaveBeenCalled();
    expect(el.getText()).toBe('x');
  });

  it('menus attached by hand as well (as older docs said) do not double', () => {
    const el = mount();
    createBubbleMenu(el.editor);
    createSlashMenu(el.editor);
    expect(menus()).toEqual({ slash: 1, bubble: 1 });
  });

  it('theme="dark" also reaches the menus, which live outside the element', () => {
    mount({ theme: 'dark' });
    expect(document.querySelector('.levit-slash-menu')!.getAttribute('data-theme')).toBe('dark');
    expect(document.querySelector('.levit-bubble-menu')!.getAttribute('data-theme')).toBe('dark');
  });

  it('removing placeholder or theme goes back to the defaults', () => {
    const el = mount({ placeholder: 'Write here', theme: 'dark' });
    el.removeAttribute('placeholder');
    el.removeAttribute('theme');
    expect(el.editor.container.getAttribute('data-placeholder')).toBe(el.editor.messages.placeholder);
    expect(el.hasAttribute('data-theme')).toBe(false);
    expect(document.querySelector('.levit-slash-menu')!.hasAttribute('data-theme')).toBe(false);
  });

  it('turning a menu off or on later takes effect at once', () => {
    const el = mount();
    el.setAttribute('slash-menu', 'false');
    expect(menus()).toEqual({ slash: 0, bubble: 1 });
    el.removeAttribute('slash-menu');
    expect(menus()).toEqual({ slash: 1, bubble: 1 });
  });
});
