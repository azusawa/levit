import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { commentsPlugin, getComments } from '../../src/plugins/comments';
import { ko } from '../../src/i18n/messages';

let container: HTMLDivElement;

beforeEach(() => {
  document.body.textContent = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

const range = (a: string, ao: number, h: string, ho: number) => ({ anchor: { blockId: a, offset: ao }, head: { blockId: h, offset: ho }, isCollapsed: a === h && ao === ho });

function setup(options: Parameters<typeof commentsPlugin>[0] = {}) {
  let n = 0;
  const editor = new LevitEditor({
    element: container,
    plugins: [commentsPlugin({ createId: () => `c${++n}`, ...options })],
    initialContent: createDocument([
      createBlock('paragraph', {}, [createTextNode('The quick brown fox')], 'a'),
      createBlock('paragraph', {}, [createTextNode('jumps over the dog')], 'b'),
    ]),
  });
  const select = (a: string, ao: number, h: string, ho: number) => editor.dispatch(editor.state.tr.setSelection(range(a, ao, h, ho)));
  return { editor, select };
}

const commentIds = (editor: LevitEditor, blockIndex: number) =>
  editor.state.doc.blocks[blockIndex].content.map((n) => [n.text, n.marks?.find((m) => m.type === 'comment')?.attrs?.ids ?? null]);

describe('commentsPlugin', () => {
  it('addComment marks the selected text and tells the app the new id and text', () => {
    const onAdd = vi.fn();
    const { editor, select } = setup({ onAdd });
    select('a', 4, 'a', 9);
    expect(editor.commands.addComment()).toBe(true);
    expect(commentIds(editor, 0)).toEqual([['The ', null], ['quick', 'c1'], [' brown fox', null]]);
    expect(onAdd).toHaveBeenCalledWith({ id: 'c1', text: 'quick' }, editor);
    const span = container.querySelector('.levit-comment') as HTMLElement;
    expect(span.textContent).toBe('quick');
    expect(span.getAttribute('data-comment-ids')).toBe('c1');
  });

  it('does nothing without selected text', () => {
    const onAdd = vi.fn();
    const { editor, select } = setup({ onAdd });
    select('a', 4, 'a', 4);
    expect(editor.commands.addComment()).toBe(false);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('keeps overlapping comments, across blocks too, and lists each once in order', () => {
    const { editor, select } = setup();
    select('a', 4, 'a', 15);
    editor.commands.addComment();
    select('a', 10, 'b', 5);
    editor.commands.addComment();
    expect(commentIds(editor, 0)).toEqual([['The ', null], ['quick ', 'c1'], ['brown', 'c1 c2'], [' fox', 'c2']]);
    expect(getComments(editor)).toEqual([
      { id: 'c1', text: 'quick brown', from: { blockId: 'a', offset: 4 }, to: { blockId: 'a', offset: 15 } },
      { id: 'c2', text: 'brown fox\njumps', from: { blockId: 'a', offset: 10 }, to: { blockId: 'b', offset: 5 } },
    ]);
  });

  it('removeComment removes one comment and leaves the others', () => {
    const { editor, select } = setup();
    select('a', 4, 'a', 15);
    editor.commands.addComment();
    select('a', 10, 'a', 19);
    editor.commands.addComment();
    editor.commands.removeComment('c1');
    expect(commentIds(editor, 0)).toEqual([['The quick ', null], ['brown fox', 'c2']]);
    expect(getComments(editor).map((c) => c.id)).toEqual(['c2']);
  });

  it('text typed right after a comment is not part of it', () => {
    const { editor, select } = setup();
    select('a', 4, 'a', 9);
    editor.commands.addComment();
    select('a', 9, 'a', 9);
    editor.chain().insertText('!').run();
    expect(commentIds(editor, 0)).toEqual([['The ', null], ['quick', 'c1'], ['! brown fox', null]]);
  });

  it('onSelect tells which comments the caret is in, and those are highlighted', () => {
    const onSelect = vi.fn();
    const { editor, select } = setup({ onSelect });
    select('a', 4, 'a', 9);
    editor.commands.addComment();
    select('b', 0, 'b', 0);
    onSelect.mockClear();
    select('a', 6, 'a', 6);
    expect(onSelect).toHaveBeenLastCalledWith(['c1'], editor);
    expect(container.querySelector('.levit-comment')!.classList.contains('is-active')).toBe(true);
    select('a', 15, 'a', 15);
    expect(onSelect).toHaveBeenLastCalledWith([], editor);
    expect(container.querySelector('.levit-comment')!.classList.contains('is-active')).toBe(false);
  });

  it('selectComment puts the selection on a comment, for a sidebar', () => {
    const { editor, select } = setup();
    select('a', 4, 'a', 9);
    editor.commands.addComment();
    select('b', 0, 'b', 0);
    expect(editor.commands.selectComment('c1')).toBe(true);
    expect(editor.state.selection).toMatchObject({ anchor: { blockId: 'a', offset: 4 }, head: { blockId: 'a', offset: 9 } });
    expect(editor.commands.selectComment('missing')).toBe(false);
  });

  it('leaves comments out of HTML and Markdown exports', () => {
    const { editor, select } = setup();
    select('a', 4, 'a', 9);
    editor.commands.addComment();
    expect(editor.getMarkdown()).toBe('The quick brown fox\n\njumps over the dog');
    expect(editor.getHTML()).not.toContain('comment');
  });

  it('ignores comment ids that are not plain names (they can come from other users)', () => {
    const editor = new LevitEditor({
      element: container,
      plugins: [commentsPlugin()],
      initialContent: createDocument([
        createBlock('paragraph', {}, [{ text: 'x', marks: [{ type: 'comment', attrs: { ids: 'ok-1 "><img src=x onerror=alert(1)>' } }] }], 'a'),
      ]),
    });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.levit-comment')!.getAttribute('data-comment-ids')).toBe('ok-1');
    expect(getComments(editor).map((c) => c.id)).toEqual(['ok-1']);
  });

  it('adds a comment button to the bubble menu, with translated titles', () => {
    const { editor } = setup();
    const item = editor.schema.bubbleItems.find((i) => i.label === '💬')!;
    expect(typeof item.title === 'function' ? item.title(editor) : item.title).toBe('Comment');
    const korean = new LevitEditor({ element: document.createElement('div'), plugins: [commentsPlugin()], messages: ko });
    const title = korean.schema.bubbleItems.find((i) => i.label === '💬')!.title;
    expect(typeof title === 'function' ? title(korean) : title).toBe('댓글');
  });
});
