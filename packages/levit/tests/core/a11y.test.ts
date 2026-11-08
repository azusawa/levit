import { describe, it, expect, beforeEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { ko } from '../../src/i18n/messages';

let container: HTMLDivElement;
beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

const key = (target: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

function editorWithText(text: string, marks: { type: string }[] = []) {
  const editor = new LevitEditor({
    element: container,
    initialContent: createDocument([createBlock('paragraph', {}, [createTextNode(text, marks)], 'p')]),
  });
  editor.focus();
  editor.dispatch(
    editor.state.tr.setSelection({
      anchor: { blockId: 'p', offset: 0 },
      head: { blockId: 'p', offset: text.length },
      isCollapsed: false,
    })
  );
  return editor;
}

describe('editor element', () => {
  it('is announced as a multi-line text box with a name', () => {
    new LevitEditor({ element: container, messages: ko });
    expect(container.getAttribute('role')).toBe('textbox');
    expect(container.getAttribute('aria-multiline')).toBe('true');
    expect(container.getAttribute('aria-label')).toBe(ko.editorLabel);
  });

  it('tells screen readers the placeholder', () => {
    new LevitEditor({ element: container, placeholder: 'Write here' });
    expect(container.getAttribute('aria-placeholder')).toBe('Write here');
  });

  it('keeps a name the page already gave it', () => {
    container.setAttribute('aria-labelledby', 'title');
    new LevitEditor({ element: container });
    expect(container.hasAttribute('aria-label')).toBe(false);
  });
});

describe('isActive', () => {
  it('is true when all selected text has the mark', () => {
    const editor = editorWithText('bold', [{ type: 'bold' }]);
    expect(editor.isActive('bold')).toBe(true);
    expect(editor.isActive('italic')).toBe(false);
  });
});

describe('slash menu', () => {
  it('is a listbox the editor points at while it is open', () => {
    const editor = new LevitEditor({ element: container });
    const slash = createSlashMenu(editor);
    const menu = slash.element;
    expect(menu.getAttribute('role')).toBe('listbox');
    expect(menu.id).not.toBe('');
    expect(menu.getAttribute('aria-label')).toBe('Insert a block');
    expect(container.hasAttribute('aria-controls')).toBe(false);

    key(container, '/');
    expect(container.getAttribute('aria-controls')).toBe(menu.id);
    const options = menu.querySelectorAll('[role="option"]');
    expect(options.length).toBe(slash.getItems().length);
    expect(container.getAttribute('aria-activedescendant')).toBe(options[0].id);
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    key(container, 'ArrowDown');
    const active = menu.querySelector('[aria-selected="true"]')!;
    expect(active.id).toBe(menu.querySelectorAll('[role="option"]')[1].id);
    expect(container.getAttribute('aria-activedescendant')).toBe(active.id);

    key(container, 'Escape');
    expect(container.hasAttribute('aria-controls')).toBe(false);
    expect(container.hasAttribute('aria-activedescendant')).toBe(false);
    slash.destroy();
  });
});

describe('bubble menu', () => {
  it('is a named toolbar whose buttons say whether they are on', () => {
    const editor = editorWithText('bold', [{ type: 'bold' }]);
    const bubble = createBubbleMenu(editor);
    expect(bubble.element.getAttribute('role')).toBe('toolbar');
    expect(bubble.element.getAttribute('aria-label')).toBe('Formatting');
    key(container, 'F10', { altKey: true });
    expect(bubble.element.querySelector('[aria-label="Bold"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(bubble.element.querySelector('[aria-label="Italic"]')!.getAttribute('aria-pressed')).toBe('false');
    bubble.destroy();
  });

  it('Alt+F10 moves focus to the toolbar, arrows move between buttons, Escape goes back', () => {
    const editor = editorWithText('text');
    const bubble = createBubbleMenu(editor);
    const buttons = Array.from(bubble.element.querySelectorAll('button'));

    expect(key(container, 'F10', { altKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
    expect(buttons.map((b) => b.tabIndex)).toEqual(buttons.map((_, i) => (i === 0 ? 0 : -1)));

    key(buttons[0], 'ArrowRight');
    expect(document.activeElement).toBe(buttons[1]);
    key(buttons[1], 'ArrowLeft');
    key(buttons[0], 'ArrowLeft');
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    key(buttons[buttons.length - 1], 'Home');
    expect(document.activeElement).toBe(buttons[0]);

    key(buttons[0], 'Escape');
    expect(document.activeElement).toBe(container);
    expect(editor.state.selection.isCollapsed).toBe(false);
    bubble.destroy();
  });

  it('a button pressed from the keyboard (click without mouse) applies its format', () => {
    const editor = editorWithText('text');
    const bubble = createBubbleMenu(editor);
    key(container, 'F10', { altKey: true });
    (bubble.element.querySelector('[aria-label="Bold"]') as HTMLButtonElement).click();
    expect(editor.isActive('bold')).toBe(true);
    expect(bubble.element.querySelector('[aria-label="Bold"]')!.getAttribute('aria-pressed')).toBe('true');
    bubble.destroy();
  });

  it('Alt+F10 does nothing without selected text', () => {
    const editor = new LevitEditor({ element: container });
    editor.focus();
    const bubble = createBubbleMenu(editor);
    expect(key(container, 'F10', { altKey: true }).defaultPrevented).toBe(false);
    bubble.destroy();
  });
});
