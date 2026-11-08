import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { en, ko } from '../../src/i18n/messages';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import '../../src/ui/web-component';

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

const doc = () =>
  createDocument([
    createBlock('task_list_item', { checked: false }, [createTextNode('task')], 't'),
    createBlock('code_block', {}, [createTextNode('x')], 'c'),
  ]);

describe('messages', () => {
  it('Korean has every message English has, and none are empty', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
    for (const value of Object.values(ko)) expect(value.trim()).not.toBe('');
  });

  it('uses English by default', () => {
    const editor = new LevitEditor({ element: container, initialContent: doc() });
    expect(editor.messages.bold).toBe('Bold');
    expect(container.querySelector('.levit-task-checkbox')!.getAttribute('aria-label')).toBe('Mark as done');
    const slash = createSlashMenu(editor);
    expect(slash.getItems().find((i) => i.id === 'heading-1')!.title).toBe('Heading 1');
    slash.destroy();
  });

  it('messages: ko translates the menus, labels and prompts', () => {
    const editor = new LevitEditor({ element: container, initialContent: doc(), messages: ko });
    expect(container.querySelector('.levit-task-checkbox')!.getAttribute('aria-label')).toBe(ko.markDone);
    expect(container.querySelector('.levit-code-language')!.getAttribute('data-label')).toBe(ko.plainText);

    const slash = createSlashMenu(editor);
    const heading = slash.getItems().find((i) => i.id === 'heading-1')!;
    expect(heading.title).toBe(ko.heading1);
    expect(heading.description).toBe(ko.heading1Description);
    slash.destroy();

    const bubble = createBubbleMenu(editor);
    expect(bubble.element.querySelector(`button[aria-label="${ko.bold}"]`)).not.toBeNull();
    expect(bubble.element.querySelector('input')!.getAttribute('aria-label')).toBe(ko.linkUrl);
    bubble.destroy();

    const prompt = vi.spyOn(window, 'prompt').mockReturnValue(null);
    container.querySelector('.levit-code-language')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(prompt).toHaveBeenCalledWith(ko.codeLanguagePrompt, '');
    prompt.mockRestore();
  });

  it('a partial set of messages overrides only those', () => {
    const editor = new LevitEditor({ element: container, messages: { bold: 'Gras' } });
    expect(editor.messages.bold).toBe('Gras');
    expect(editor.messages.italic).toBe('Italic');
  });

  it('fills {placeholders} in messages', () => {
    const editor = new LevitEditor({
      element: container,
      initialContent: createDocument([createBlock('code_block', { language: 'ts' }, [createTextNode('x')])]),
      messages: ko,
    });
    expect(container.querySelector('.levit-code-language')!.getAttribute('aria-label')).toBe(
      ko.codeLanguageLabel.replace('{language}', 'ts')
    );
    expect(editor.t('codeLanguageLabel', { language: 'go' })).toBe(ko.codeLanguageLabel.replace('{language}', 'go'));
  });

  it('<levit-editor lang="ko"> uses Korean, including the default placeholder', () => {
    const el = document.createElement('levit-editor');
    el.setAttribute('lang', 'ko');
    document.body.appendChild(el);
    const editor = (el as any).editor as LevitEditor;
    expect(editor.messages.bold).toBe(ko.bold);
    expect(editor.container.getAttribute('data-placeholder')).toBe(ko.placeholder);
    el.remove();
  });
});
