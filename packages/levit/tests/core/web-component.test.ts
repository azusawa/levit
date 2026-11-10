import { describe, it, expect, beforeEach } from 'vitest';
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

  it('removes its menus when it is removed', () => {
    const el = mount();
    el.remove();
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
});
