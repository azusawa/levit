import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';

describe('LevitEditor High-Level Class', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('mounts into DOM container and renders initial paragraph', () => {
    const editor = new LevitEditor({ element: container });
    expect(container.querySelector('.levit-block-paragraph')).not.toBeNull();
    expect(editor.getText()).toBe('');
    editor.destroy();
  });

  it('loads initial JSON content', () => {
    const editor = new LevitEditor({
      element: container,
      initialContent: {
        version: 1,
        blocks: [
          {
            id: 'init-1',
            type: 'heading',
            attrs: { level: 1 },
            content: [{ text: 'Hello Levit', marks: [] }],
          },
        ],
      },
    });

    expect(editor.getText()).toBe('Hello Levit');
    expect(container.querySelector('h1')?.textContent).toBe('Hello Levit');
    editor.destroy();
  });

  it('executes chained commands and triggers onChange', () => {
    const onChange = vi.fn();
    const editor = new LevitEditor({
      element: container,
      onChange,
    });

    editor.chain().insertText('Amazing Web Editor').run();

    expect(editor.getText()).toBe('Amazing Web Editor');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(editor.getJSON().blocks[0].content[0].text).toBe('Amazing Web Editor');
    editor.destroy();
  });

  it('supports undo/redo through editor commands', () => {
    const editor = new LevitEditor({ element: container });
    editor.chain().insertText('First').run();
    editor.chain().insertText(' Second').run();

    expect(editor.getText()).toBe('First Second');

    editor.undo();
    expect(editor.getText()).toBe('First');

    editor.redo();
    expect(editor.getText()).toBe('First Second');
    editor.destroy();
  });

  it('changes block type to heading via command', () => {
    const editor = new LevitEditor({ element: container });
    editor.chain().insertText('My Header').setHeading(2).run();

    expect(container.querySelector('h2')?.textContent).toBe('My Header');
    expect(editor.getJSON().blocks[0].type).toBe('heading');
    expect(editor.getJSON().blocks[0].attrs?.level).toBe(2);
    editor.destroy();
  });
});

