import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { aiPlugin, runAICommand, type AIRequest } from '../../src/ai/commands';
import { getAIContext } from '../../src/ai/stream';
import { ko } from '../../src/i18n/messages';
import type { BlockNode } from '../../src/core/model/types';

let container: HTMLDivElement;
beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.appendChild(container);
});

const para = (id: string, text: string, marks: { type: string }[] = []) =>
  createBlock('paragraph', {}, [createTextNode(text, marks)], id);

/** A provider that records requests and answers with the given chunks. */
function fakeProvider(...answer: string[]) {
  const requests: AIRequest[] = [];
  const provider = vi.fn((request: AIRequest) => {
    requests.push(request);
    return (async function* () {
      for (const chunk of answer) yield chunk;
    })();
  });
  return { provider, requests };
}

function editorWith(blocks: BlockNode[], provider: ReturnType<typeof fakeProvider>['provider'], extra: Record<string, any> = {}) {
  const editor = new LevitEditor({
    element: container,
    initialContent: createDocument(blocks),
    plugins: [aiPlugin({ provider, ...extra.ai })],
    ...extra.editor,
  });
  editor.focus();
  return editor;
}

const select = (editor: LevitEditor, blockId: string, from: number, to: number, toBlock = blockId) =>
  editor.dispatch(
    editor.state.tr.setSelection({
      anchor: { blockId, offset: from },
      head: { blockId: toBlock, offset: to },
      isCollapsed: blockId === toBlock && from === to,
    })
  );

const texts = (editor: LevitEditor) => editor.state.doc.blocks.map((b) => getBlockText(b));

describe('runAICommand', () => {
  it('improve: sends the selection as Markdown with context, and replaces it', async () => {
    const { provider, requests } = fakeProvider('Better ', 'text');
    const editor = editorWith([para('a', 'Before.'), para('b', 'bad text', [{ type: 'bold' }]), para('c', 'After.')], provider);
    select(editor, 'b', 0, 8);
    await runAICommand(editor, 'improve');

    expect(requests[0]).toMatchObject({ command: 'improve', text: '**bad text**', before: 'Before.', after: 'After.' });
    expect(requests[0].prompt).toMatch(/improve/i);
    expect(requests[0].signal).toBeInstanceOf(AbortSignal);
    // Improve proposes the change; accepting it replaces the text.
    expect(editor.commands.acceptSuggestions()).toBe(true);
    expect(texts(editor)).toEqual(['Before.', 'Better text', 'After.']);
  });

  it('improve without a selection does nothing and does not call the AI', async () => {
    const { provider } = fakeProvider('x');
    const editor = editorWith([para('a', 'text')], provider);
    select(editor, 'a', 2, 2);
    expect(await runAICommand(editor, 'improve')).toBeNull();
    expect(provider).not.toHaveBeenCalled();
  });

  it('continue: writes at the caret, with the text before it as context', async () => {
    const { provider, requests } = fakeProvider(' and more.');
    const editor = editorWith([para('a', 'Once upon a time')], provider);
    select(editor, 'a', 16, 16);
    await runAICommand(editor, 'continue');
    expect(requests[0]).toMatchObject({ command: 'continue', before: 'Once upon a time' });
    expect(texts(editor)).toEqual(['Once upon a time and more.']);
  });

  it('summarize without a selection: summarizes the document below the current block, undone in one step', async () => {
    const { provider, requests } = fakeProvider('- point one\n- point two');
    const editor = editorWith([para('a', 'Long text.'), para('b', 'More text.')], provider);
    select(editor, 'a', 3, 3);
    await runAICommand(editor, 'summarize');
    expect(requests[0].text).toBe('Long text.\n\nMore text.');
    expect(editor.state.doc.blocks.map((b) => [b.type, getBlockText(b)])).toEqual([
      ['paragraph', 'Long text.'],
      ['bullet_list_item', 'point one'],
      ['bullet_list_item', 'point two'],
      ['paragraph', 'More text.'],
    ]);
    editor.undo();
    expect(texts(editor)).toEqual(['Long text.', 'More text.']);
  });

  it('summarize with a selection: goes below the selected blocks', async () => {
    const { provider } = fakeProvider('Short.');
    const editor = editorWith([para('a', 'One.'), para('b', 'Two.'), para('c', 'Three.')], provider);
    select(editor, 'a', 0, 4, 'b');
    await runAICommand(editor, 'summarize');
    expect(texts(editor)).toEqual(['One.', 'Two.', 'Short.', 'Three.']);
  });

  it('runs custom commands, and a custom prompt for one run', async () => {
    const { provider, requests } = fakeProvider('Hello');
    const editor = editorWith([para('a', 'Bonjour')], provider, {
      ai: { commands: [{ id: 'translate', title: 'Translate', prompt: 'Translate to English.', insert: 'replace', needsSelection: true }] },
    });
    select(editor, 'a', 0, 7);
    await runAICommand(editor, 'translate');
    expect(requests[0].prompt).toBe('Translate to English.');
    // Like Improve, a custom "replace" command proposes its answer.
    editor.commands.acceptSuggestions();
    expect(texts(editor)).toEqual(['Hello']);

    select(editor, 'a', 0, 5);
    await runAICommand(editor, 'improve', { prompt: 'Make it shout.' });
    expect(requests[1].prompt).toBe('Make it shout.');
  });

  it('accepts a provider that returns a promise of a stream', async () => {
    const provider = vi.fn(async () => (async function* () { yield 'ok'; })());
    const editor = editorWith([para('a', '')], provider as never);
    await runAICommand(editor, 'continue');
    expect(texts(editor)).toEqual(['ok']);
  });

  it('refuses unknown commands and editors without the AI plugin', async () => {
    const { provider } = fakeProvider('x');
    const editor = editorWith([para('a', '')], provider);
    await expect(runAICommand(editor, 'nope')).rejects.toThrow(/Unknown AI command "nope"/);
    const plain = new LevitEditor({ element: document.createElement('div') });
    await expect(runAICommand(plain, 'continue')).rejects.toThrow(/aiPlugin/);
  });

  it('Escape stops a running answer and keeps what arrived', async () => {
    let release: () => void = () => {};
    const provider = vi.fn((request: AIRequest) =>
      (async function* () {
        yield 'first';
        await new Promise<void>((resolve) => {
          release = resolve;
          request.signal.addEventListener('abort', () => resolve());
        });
        yield ' second';
      })()
    );
    const editor = editorWith([para('a', '')], provider as never);
    const run = runAICommand(editor, 'continue');
    await vi.waitFor(() => expect(texts(editor)).toEqual(['first']));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    release();
    expect(await run).toEqual({ markdown: 'first', aborted: true });
    expect(texts(editor)).toEqual(['first']);
  });

  it('runs one command at a time', async () => {
    const { provider } = fakeProvider('a');
    const editor = editorWith([para('a', '')], provider);
    const first = runAICommand(editor, 'continue');
    await expect(runAICommand(editor, 'continue')).rejects.toThrow(/already running/);
    await first;
  });

  it('a failing provider rejects and leaves the editor editable', async () => {
    const provider = vi.fn(() => (async function* () { throw new Error('quota'); })());
    const editor = editorWith([para('a', '')], provider as never);
    await expect(runAICommand(editor, 'continue')).rejects.toThrow('quota');
    expect(editor.isEditable).toBe(true);
  });
});

describe('menus', () => {
  it('the slash menu lists the AI commands in the editor language', async () => {
    const { provider } = fakeProvider('done');
    const editor = editorWith([para('a', '')], provider, { editor: { messages: ko } });
    const slash = createSlashMenu(editor);
    const items = slash.getItems().filter((i) => i.id.startsWith('ai-'));
    expect(items.map((i) => i.title)).toEqual([ko.aiImprove, ko.aiContinue, ko.aiSummarize]);
    items.find((i) => i.id === 'ai-continue')!.action(editor);
    await vi.waitFor(() => expect(texts(editor)).toEqual(['done']));
    slash.destroy();
  });

  it('the bubble menu has an AI button that improves the selection', async () => {
    const { provider } = fakeProvider('Fixed');
    const editor = editorWith([para('a', 'broke')], provider);
    select(editor, 'a', 0, 5);
    const bubble = createBubbleMenu(editor);
    const button = bubble.element.querySelector('button[aria-label="Improve writing"]')!;
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(container.querySelector('ins')?.textContent).toBe('Fixed'));
    editor.commands.acceptSuggestions();
    expect(texts(editor)).toEqual(['Fixed']);
    bubble.destroy();
  });

  it('errors from menu runs go to onError', async () => {
    const onError = vi.fn();
    const provider = vi.fn(() => (async function* () { throw new Error('offline'); })());
    const editor = editorWith([para('a', '')], provider as never, { editor: { onError } });
    const slash = createSlashMenu(editor);
    slash.getItems().find((i) => i.id === 'ai-continue')!.action(editor);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' })));
    slash.destroy();
  });
});

describe('getAIContext', () => {
  it('fills in the selected text', () => {
    const { provider } = fakeProvider();
    const editor = editorWith([para('a', 'Hello world')], provider);
    select(editor, 'a', 6, 11);
    expect(getAIContext(editor).selectedText).toBe('world');
  });
});

describe('review fixes: commands', () => {
  it('locks the editor while waiting for the provider, and uses the selection from the start', async () => {
    let resolve!: (stream: AsyncIterable<string>) => void;
    const provider = vi.fn(() => new Promise<AsyncIterable<string>>((r) => (resolve = r)));
    const editor = editorWith([para('a', 'one two')], provider as never);
    select(editor, 'a', 4, 7);
    const run = runAICommand(editor, 'improve');
    await Promise.resolve();
    expect(editor.isEditable).toBe(false);
    select(editor, 'a', 0, 3);
    resolve((async function* () { yield 'TWO'; })());
    await run;
    editor.commands.acceptSuggestions();
    expect(texts(editor)).toEqual(['one TWO']);
  });

  it('contextLength: 0 sends no surrounding text', async () => {
    const { provider, requests } = fakeProvider('x');
    const editor = editorWith([para('a', 'Before.'), para('b', 'text'), para('c', 'After.')], provider, { ai: { contextLength: 0 } });
    select(editor, 'b', 0, 4);
    await runAICommand(editor, 'improve');
    expect([requests[0].before, requests[0].after]).toEqual(['', '']);
  });

  it('Escape that something else already handled does not stop the answer', async () => {
    let release!: () => void;
    const provider = vi.fn((request: AIRequest) =>
      (async function* () {
        yield 'a';
        await new Promise<void>((r) => {
          release = r;
          request.signal.addEventListener('abort', () => r());
        });
        yield 'b';
      })()
    );
    const editor = editorWith([para('a', '')], provider as never);
    const run = runAICommand(editor, 'continue');
    await vi.waitFor(() => expect(texts(editor)).toEqual(['a']));
    const handled = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    handled.preventDefault();
    document.body.dispatchEvent(handled);
    release();
    expect(await run).toEqual({ markdown: 'ab', aborted: false });
  });
});

describe('review fixes: a change while the provider is thinking', () => {
  it('drops the answer instead of writing over the change', async () => {
    let resolve!: (stream: AsyncIterable<string>) => void;
    const provider = vi.fn(() => new Promise<AsyncIterable<string>>((r) => (resolve = r)));
    const editor = editorWith([para('a', 'text')], provider as never);
    select(editor, 'a', 4, 4);
    const run = runAICommand(editor, 'continue');
    await Promise.resolve();
    editor.chain().setHeading(1).run();
    resolve((async function* () { yield ' more'; })());
    expect(await run).toEqual({ markdown: '', aborted: true });
    expect(editor.state.doc.blocks[0].type).toBe('heading');
    expect(texts(editor)).toEqual(['text']);
    expect(editor.isEditable).toBe(true);
  });
});
