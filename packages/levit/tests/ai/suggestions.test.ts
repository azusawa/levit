import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { aiPlugin, runAICommand, type AIRequest } from '../../src/ai/commands';
import { ko } from '../../src/i18n/messages';
import type { BlockNode, DocumentData } from '../../src/core/model/types';

let container: HTMLDivElement;
beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement('div');
  document.body.appendChild(container);
});

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);

function setup(blocks: BlockNode[], answer: string[], options: Record<string, any> = {}, seen: DocumentData[] = []) {
  let editor!: LevitEditor;
  const provider = vi.fn((_request: AIRequest) =>
    (async function* () {
      for (const chunk of answer) {
        yield chunk;
        seen.push(editor.state.doc);
      }
    })()
  );
  editor = new LevitEditor({
    element: container,
    initialContent: createDocument(blocks),
    plugins: [aiPlugin({ provider, ...options })],
    ...(options.editor ?? {}),
  });
  editor.focus();
  return editor;
}

const select = (editor: LevitEditor, blockId: string, from: number, toBlock: string, to: number) =>
  editor.dispatch(
    editor.state.tr.setSelection({
      anchor: { blockId, offset: from },
      head: { blockId: toBlock, offset: to },
      isCollapsed: false,
    })
  );

/** Text runs as text<i>/text<d> for suggested inserts and deletions. */
const runs = (doc: DocumentData) =>
  doc.blocks.map((b) =>
    b.content
      .map((n) => {
        const types = (n.marks ?? []).map((m) => m.type);
        return n.text + (types.includes('suggestion_insert') ? '<i>' : types.includes('suggestion_delete') ? '<d>' : '');
      })
      .join('|')
  );
const texts = (editor: LevitEditor) => editor.state.doc.blocks.map((b) => getBlockText(b));

describe('improve proposes changes', () => {
  it('marks only the words that changed', async () => {
    const editor = setup([para('a', 'teh cat sat')], ['the cat sat']);
    select(editor, 'a', 0, 'a', 11);
    await runAICommand(editor, 'improve');
    expect(runs(editor.state.doc)).toEqual(['teh<d>|the<i>| cat sat']);
    expect(container.querySelector('del.levit-suggestion-delete')?.textContent).toBe('teh');
    expect(container.querySelector('ins.levit-suggestion-insert')?.textContent).toBe('the');
  });

  it('while it streams, shows the old text deleted and the new text added', async () => {
    const seen: DocumentData[] = [];
    const editor = setup([para('a', 'old text')], ['new ', 'text'], {}, seen);
    select(editor, 'a', 0, 'a', 8);
    await runAICommand(editor, 'improve');
    // The whole block is replaced, so no space is kept at the end of the answer.
    expect(runs(seen[0])).toEqual(['old text<d>|new<i>']);
  });

  it('accept keeps the new text; reject brings back the old', async () => {
    for (const [command, expected] of [['acceptSuggestions', 'the cat sat'], ['rejectSuggestions', 'teh cat sat']] as const) {
      const editor = setup([para('a', 'teh cat sat')], ['the cat sat']);
      select(editor, 'a', 0, 'a', 11);
      await runAICommand(editor, 'improve');
      expect(editor.commands[command]()).toBe(true);
      expect(runs(editor.state.doc)).toEqual([expected]);
      editor.destroy();
      container.replaceChildren();
    }
  });

  it('keeps blocks right when the answer has a different shape', async () => {
    for (const [command, expected] of [
      ['acceptSuggestions', ['abX', 'Ygh']],
      ['rejectSuggestions', ['abCD', 'EFgh']],
    ] as const) {
      const editor = setup([para('a', 'abCD'), para('b', 'EFgh')], ['X\n\nY\n\nZ'.slice(0, 4)]);
      select(editor, 'a', 2, 'b', 2);
      await runAICommand(editor, 'improve');
      editor.commands[command]();
      expect(texts(editor)).toEqual(expected);
      editor.destroy();
      container.replaceChildren();
    }
  });

  it('whole blocks replaced by more blocks: accept gives the new blocks, reject the old', async () => {
    const make = () => {
      const editor = setup([para('a', 'One.'), para('b', 'Two.'), para('c', 'End.')], ['New one.\n\nNew two.\n\nNew three.']);
      select(editor, 'a', 0, 'b', 4);
      return editor;
    };
    let editor = make();
    await runAICommand(editor, 'improve');
    editor.commands.acceptSuggestions();
    expect(texts(editor)).toEqual(['New one.', 'New two.', 'New three.', 'End.']);
    editor.destroy();
    container.replaceChildren();
    editor = make();
    await runAICommand(editor, 'improve');
    editor.commands.rejectSuggestions();
    expect(texts(editor)).toEqual(['One.', 'Two.', 'End.']);
  });

  it('blocks with the same shape get word changes in each', async () => {
    const editor = setup([para('a', 'Fist line'), para('b', 'Secnd line')], ['First line\n\nSecond line']);
    select(editor, 'a', 0, 'b', 10);
    await runAICommand(editor, 'improve');
    expect(runs(editor.state.doc)).toEqual(['Fist<d>|First<i>| line', 'Secnd<d>|Second<i>| line']);
  });

  it('the proposal is undone in one step', async () => {
    const editor = setup([para('a', 'teh cat')], ['the ', 'cat']);
    select(editor, 'a', 0, 'a', 7);
    await runAICommand(editor, 'improve');
    editor.undo();
    expect(runs(editor.state.doc)).toEqual(['teh cat']);
  });

  it('can be turned off: suggestions: false replaces directly', async () => {
    const editor = setup([para('a', 'teh cat')], ['the cat'], { suggestions: false });
    select(editor, 'a', 0, 'a', 7);
    await runAICommand(editor, 'improve');
    expect(runs(editor.state.doc)).toEqual(['the cat']);
  });

  it('typing right after a suggestion does not become part of it', async () => {
    const editor = setup([para('a', 'old')], ['new']);
    select(editor, 'a', 0, 'a', 3);
    await runAICommand(editor, 'improve');
    editor.setSelectionQuietly({ anchor: { blockId: 'a', offset: 6 }, head: { blockId: 'a', offset: 6 }, isCollapsed: true });
    editor.chain().insertText('!').run();
    expect(runs(editor.state.doc)).toEqual(['old<d>|new<i>|!']);
  });

  it('a very large change still finishes quickly', async () => {
    const words = (n: number, w: string) => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');
    const editor = setup([para('a', words(3000, 'a'))], [words(3000, 'b')]);
    select(editor, 'a', 0, 'a', getBlockText(editor.state.doc.blocks[0]).length);
    const start = performance.now();
    await runAICommand(editor, 'improve');
    expect(performance.now() - start).toBeLessThan(2000);
    editor.commands.acceptSuggestions();
    expect(texts(editor)).toEqual([words(3000, 'b')]);
  });
});

describe('exports while a suggestion is open', () => {
  it('HTML shows <del> and <ins>; Markdown and text read as if accepted', async () => {
    const editor = setup([para('a', 'teh cat')], ['the cat']);
    select(editor, 'a', 0, 'a', 7);
    await runAICommand(editor, 'improve');
    expect(editor.getHTML()).toBe('<p><del>teh</del><ins>the</ins> cat</p>');
    expect(editor.getMarkdown()).toBe('the cat');
  });
});

describe('suggestion toolbar', () => {
  it('appears near a suggestion with accept and reject buttons, and goes away after', async () => {
    const editor = setup([para('a', 'teh cat')], ['the cat'], { editor: { messages: ko } });
    const toolbar = () => document.querySelector('.levit-suggestion-bar') as HTMLElement;
    expect(toolbar().style.display).toBe('none');
    select(editor, 'a', 0, 'a', 7);
    await runAICommand(editor, 'improve');
    expect(toolbar().style.display).not.toBe('none');
    expect(toolbar().getAttribute('role')).toBe('toolbar');
    const accept = toolbar().querySelector(`button[aria-label="${ko.suggestionAccept}"]`) as HTMLButtonElement;
    expect(toolbar().querySelector(`button[aria-label="${ko.suggestionReject}"]`)).not.toBeNull();
    accept.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(texts(editor)).toEqual(['the cat']);
    expect(toolbar().style.display).toBe('none');
  });

  it('keyboard: Mod+Shift+Enter accepts, Mod+Shift+Backspace rejects', async () => {
    const editor = setup([para('a', 'teh cat')], ['the cat']);
    select(editor, 'a', 0, 'a', 7);
    await runAICommand(editor, 'improve');
    const key = (k: string) =>
      container.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    key('Backspace');
    expect(texts(editor)).toEqual(['teh cat']);
  });

  it('is removed with the editor', () => {
    const editor = setup([para('a', 'x')], []);
    editor.destroy();
    expect(document.querySelector('.levit-suggestion-bar')).toBeNull();
  });
});

describe('while the answer is still streaming', () => {
  it('the toolbar stays hidden and accept/reject do nothing', async () => {
    const seen: [string, boolean][] = [];
    let editor!: LevitEditor;
    const provider = vi.fn(() =>
      (async function* () {
        yield 'new ';
        const bar = document.querySelector('.levit-suggestion-bar') as HTMLElement;
        seen.push([bar.style.display, editor.commands.acceptSuggestions()]);
        yield 'text';
      })()
    );
    editor = new LevitEditor({ element: container, initialContent: createDocument([para('a', 'old text')]), plugins: [aiPlugin({ provider })] });
    select(editor, 'a', 0, 'a', 8);
    await runAICommand(editor, 'improve');
    expect(seen).toEqual([['none', false]]);
    expect((document.querySelector('.levit-suggestion-bar') as HTMLElement).style.display).toBe('flex');
  });
});
