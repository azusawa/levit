import { describe, it, expect, beforeEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { streamMarkdown } from '../../src/ai/stream-markdown';
import type { DocumentData } from '../../src/core/model/types';

let container: HTMLDivElement;
beforeEach(() => {
  document.body.innerHTML = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

function editorWith(text = '', caret = text.length, selectTo?: number) {
  const editor = new LevitEditor({
    element: container,
    initialContent: createDocument([createBlock('paragraph', {}, [createTextNode(text)], 'p')]),
  });
  editor.dispatch(
    editor.state.tr.setSelection({
      anchor: { blockId: 'p', offset: caret },
      head: { blockId: 'p', offset: selectTo ?? caret },
      isCollapsed: selectTo === undefined || selectTo === caret,
    })
  );
  return editor;
}

const summary = (doc: DocumentData) =>
  doc.blocks.map((b) => [b.type, b.content.map((n) => (n.marks?.length ? `${n.text}<${n.marks.map((m) => m.type).join(',')}>` : n.text)).join('')]);

/** Yields chunks; `seen` gets a snapshot of the document before each next chunk. */
async function* chunks(parts: string[], editor: LevitEditor, seen: DocumentData[] = []) {
  for (const part of parts) {
    yield part;
    seen.push(editor.state.doc);
  }
}

describe('streamMarkdown', () => {
  it('turns streamed Markdown into formatted blocks', async () => {
    const editor = editorWith();
    await streamMarkdown(editor, chunks(['# Ti', 'tle\n\nSome **bo', 'ld** text\n\n- a\n- b'], editor));
    expect(summary(editor.state.doc)).toEqual([
      ['heading', 'Title'],
      ['paragraph', 'Some bold<bold> text'],
      ['bullet_list_item', 'a'],
      ['bullet_list_item', 'b'],
    ]);
  });

  it('shows formatting that is not closed yet while it streams', async () => {
    const editor = editorWith();
    const seen: DocumentData[] = [];
    await streamMarkdown(editor, chunks(['Some **bo', 'ld** and ```', 'js\nconst a', ' = 1\n```'], editor, seen));
    expect(summary(seen[0])).toEqual([['paragraph', 'Some bo<bold>']]);
  });

  it('shows an open code fence as a code block while it streams', async () => {
    const editor = editorWith();
    const seen: DocumentData[] = [];
    await streamMarkdown(editor, chunks(['```js\nconst a', ' = 1\n```'], editor, seen));
    expect(seen[0].blocks[0]).toMatchObject({ type: 'code_block', attrs: { language: 'js' } });
    expect(getBlockText(seen[0].blocks[0])).toBe('const a');
  });

  it('inserts at the caret, inside existing text', async () => {
    const editor = editorWith('Hello world', 6);
    await streamMarkdown(editor, chunks(['big ', '**new** '], editor));
    expect(summary(editor.state.doc)).toEqual([['paragraph', 'Hello big new<bold> world']]);
  });

  it('replaces the selection', async () => {
    const editor = editorWith('Hello world', 6, 11);
    await streamMarkdown(editor, chunks(['there'], editor));
    expect(summary(editor.state.doc)).toEqual([['paragraph', 'Hello there']]);
  });

  it('is undone in one step, and redone in one step', async () => {
    const editor = editorWith('Start');
    await streamMarkdown(editor, chunks([' one', ' two', '\n\nthree'], editor));
    expect(editor.state.doc.blocks).toHaveLength(2);
    editor.undo();
    expect(summary(editor.state.doc)).toEqual([['paragraph', 'Start']]);
    editor.redo();
    expect(summary(editor.state.doc)).toEqual([['paragraph', 'Start one two'], ['paragraph', 'three']]);
  });

  it('keeps finished blocks on screen instead of rebuilding them', async () => {
    const editor = editorWith();
    let firstBlock: Element | null = null;
    async function* parts() {
      yield 'First paragraph.\n\n';
      firstBlock = container.querySelector('[data-block-id]');
      yield 'Second';
      yield ' paragraph.';
    }
    await streamMarkdown(editor, parts());
    expect(container.querySelector('[data-block-id]')).toBe(firstBlock);
  });

  it('locks editing while it streams', async () => {
    const editor = editorWith();
    const states: [boolean, string | null][] = [];
    async function* parts() {
      yield 'a';
      states.push([editor.isEditable, container.getAttribute('aria-busy')]);
      yield 'b';
    }
    await streamMarkdown(editor, parts());
    expect(states).toEqual([[false, 'true']]);
    expect(editor.isEditable).toBe(true);
    expect(container.getAttribute('contenteditable')).toBe('true');
    expect(container.hasAttribute('aria-busy')).toBe(false);
  });

  it('stops when aborted and keeps what arrived', async () => {
    const editor = editorWith();
    const controller = new AbortController();
    async function* parts() {
      yield 'kept';
      controller.abort();
      yield ' dropped';
    }
    const result = await streamMarkdown(editor, parts(), { signal: controller.signal });
    expect(result).toEqual({ markdown: 'kept', aborted: true });
    expect(summary(editor.state.doc)).toEqual([['paragraph', 'kept']]);
    expect(editor.isEditable).toBe(true);
  });

  it('unlocks the editor and rethrows when the stream fails', async () => {
    const editor = editorWith();
    async function* parts() {
      yield 'partial';
      throw new Error('network');
    }
    await expect(streamMarkdown(editor, parts())).rejects.toThrow('network');
    expect(editor.isEditable).toBe(true);
    expect(summary(editor.state.doc)).toEqual([['paragraph', 'partial']]);
  });

  it('drops unsafe links from the answer', async () => {
    const editor = editorWith();
    await streamMarkdown(editor, chunks(['[click](javascript:alert(1)) and [ok](https://x.test)'], editor));
    const marks = editor.state.doc.blocks[0].content.flatMap((n) => n.marks ?? []);
    expect(marks).toEqual([{ type: 'link', attrs: { href: 'https://x.test' } }]);
  });

  it('handles a long answer in many small chunks quickly', async () => {
    const editor = editorWith();
    const parts = Array.from({ length: 1500 }, (_, i) => (i % 50 === 49 ? 'word.\n\n' : `w${i} `));
    const start = performance.now();
    await streamMarkdown(editor, chunks(parts, editor));
    expect(performance.now() - start).toBeLessThan(3000);
    expect(editor.state.doc.blocks.length).toBe(30);
  });
});

describe('spaces at the edges of an answer', () => {
  it('are dropped when there is no text next to them', async () => {
    const editor = editorWith('', 0);
    await streamMarkdown(editor, chunks([' and more. '], editor));
    expect(summary(editor.state.doc)).toEqual([['paragraph', 'and more.']]);
  });

  it('are kept where the answer meets text', async () => {
    const editor = editorWith('ab', 1);
    await streamMarkdown(editor, chunks([' x '], editor));
    expect(summary(editor.state.doc)).toEqual([['paragraph', 'a x b']]);
  });
});

describe('review fixes: streaming', () => {
  it('gives streamed blocks ids that differ between runs and page loads', async () => {
    const editor = editorWith('');
    await streamMarkdown(editor, chunks(['a\n\nb\n\nc'], editor));
    const first = editor.state.doc.blocks.map((b) => b.id);
    await streamMarkdown(editor, chunks(['\n\nd\n\ne'], editor));
    const ids = editor.state.doc.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.slice(1).every((id) => !/^ai\d+-\d+$/.test(id))).toBe(true);
  });

  it('a stream that throws AbortError after an abort counts as stopped, and the text is finished', async () => {
    const editor = editorWith('');
    const controller = new AbortController();
    async function* parts() {
      yield 'Some **bo';
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    }
    const result = await streamMarkdown(editor, parts(), { signal: controller.signal });
    expect(result).toEqual({ markdown: 'Some **bo', aborted: true });
    // The final render reads the text as written: no ** is added to close it,
    // so nothing is left bold.
    expect(editor.state.doc.blocks[0].content.some((n) => n.marks?.some((m) => m.type === 'bold'))).toBe(false);
  });

  it('stops when the document is changed from outside, and keeps that change', async () => {
    const editor = editorWith('start', 5);
    async function* parts() {
      yield ' one';
      editor.chain().setHeading(2).run();
      yield ' two';
    }
    const result = await streamMarkdown(editor, parts());
    expect(result.aborted).toBe(true);
    expect(editor.state.doc.blocks[0].type).toBe('heading');
  });

  it('fires a transaction event for each update', async () => {
    const editor = editorWith('');
    const transactions: unknown[] = [];
    editor.on('transaction', ({ transaction }) => transactions.push(transaction));
    await streamMarkdown(editor, chunks(['a', 'b'], editor), { minInterval: 0 });
    expect(transactions.length).toBeGreaterThanOrEqual(2);
  });

  it('leaves a read-only editor read-only', async () => {
    const editor = editorWith('');
    editor.setEditable(false);
    await streamMarkdown(editor, chunks(['x'], editor));
    expect(editor.isEditable).toBe(false);
  });

  it('draws at most once per interval, but always the final text', async () => {
    const editor = editorWith('');
    let renders = 0;
    editor.on('update', () => renders++);
    const parts = Array.from({ length: 200 }, () => 'word ');
    await streamMarkdown(editor, chunks(parts, editor), { minInterval: 10_000 });
    expect(renders).toBe(2);
    expect(getBlockText(editor.state.doc.blocks[0])).toBe('word '.repeat(200).trim());
  });
});

describe('closeOpenMarkdown', () => {
  it('does not treat a "* " list marker or * inside `code` as italic', async () => {
    const { closeOpenMarkdown } = await import('../../src/ai/stream-markdown');
    expect(closeOpenMarkdown('* first item')).toBe('* first item');
    expect(closeOpenMarkdown('use `a*b` here')).toBe('use `a*b` here');
    expect(closeOpenMarkdown('* some *ital')).toBe('* some *ital*');
  });
});
