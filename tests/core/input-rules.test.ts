import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';

describe('Markdown Live Shortcuts (Input Rules)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('converts block to heading 1 when typing "# "', () => {
    const editor = new LevitEditor({ element: container });
    editor.chain().insertText('# ').run();

    expect(editor.getJSON().blocks[0].type).toBe('heading');
    expect(editor.getJSON().blocks[0].attrs?.level).toBe(1);
    expect(editor.getText()).toBe('');
    editor.destroy();
  });

  it('converts block to blockquote when typing "> "', () => {
    const editor = new LevitEditor({ element: container });
    editor.chain().insertText('> ').run();

    expect(editor.getJSON().blocks[0].type).toBe('blockquote');
    expect(editor.getText()).toBe('');
    editor.destroy();
  });

  it('converts block to code_block when typing "```"', () => {
    const editor = new LevitEditor({ element: container });
    editor.chain().insertText('```').run();

    expect(editor.getJSON().blocks[0].type).toBe('code_block');
    expect(editor.getText()).toBe('');
    editor.destroy();
  });
});

