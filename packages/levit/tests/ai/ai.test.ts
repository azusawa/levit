import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { getAIContext, streamAIResponse } from '../../src/ai/stream';

describe('AI-Native Integration API', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('extracts structured context for LLM prompt', () => {
    const editor = new LevitEditor({ element: container });
    editor.chain().insertText('Section One').setHeading(1).run();
    editor.chain().splitBlock().insertText('Details about the topic').run();

    const context = getAIContext(editor);
    expect(context.documentText).toContain('Section One\nDetails about the topic');
    expect(context.blockCount).toBe(2);
    expect(context.summary).toBeDefined();
    editor.destroy();
  });

  it('streams AI chunks sequentially into editor state', async () => {
    const editor = new LevitEditor({ element: container });
    
    // Create an async generator simulating LLM token stream
    async function* mockStream() {
      yield 'Hello ';
      yield 'from ';
      yield 'AI!';
    }

    await streamAIResponse(editor, mockStream());

    expect(editor.getText()).toBe('Hello from AI!');
    editor.destroy();
  });
});

