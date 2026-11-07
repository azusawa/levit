import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { LevitEditor } from '../../src/core/editor';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { applyInputRules } from '../../src/core/plugin/input-rules';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { BlockNode, DocumentData } from '../../src/core/model/types';

function typeInto(state: EditorState, text: string): EditorState {
  for (const ch of text) {
    const tr = state.tr.insertText(ch);
    applyInputRules(tr);
    state = tr.apply();
  }
  return state;
}

function caret(blockId: string, offset: number) {
  return { anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true };
}

function range(blockId: string, from: number, to: number) {
  return { anchor: { blockId, offset: from }, head: { blockId, offset: to }, isCollapsed: false };
}

const summary = (doc: DocumentData) => doc.blocks.map((b) => [b.type, getBlockText(b)]);

describe('list input rules', () => {
  it.each([
    ['- ', 'bullet_list_item'],
    ['* ', 'bullet_list_item'],
    ['1. ', 'ordered_list_item'],
  ])('"%s" turns an empty paragraph into %s', (trigger, type) => {
    const state = typeInto(EditorState.create(), `${trigger}item`);
    expect(summary(state.doc)).toEqual([[type, 'item']]);
  });

  it('does not trigger inside a code block', () => {
    const block = createBlock('code_block', {}, [createTextNode('')], 'c');
    let state = EditorState.create({ doc: createDocument([block]) });
    state = state.tr.setSelection(caret('c', 0)).apply();
    state = typeInto(state, '- x');
    expect(summary(state.doc)).toEqual([['code_block', '- x']]);
  });

  it('does not trigger in the middle of text', () => {
    const state = typeInto(EditorState.create(), 'a - b');
    expect(summary(state.doc)).toEqual([['paragraph', 'a - b']]);
  });
});

describe('Enter and Backspace in list items', () => {
  function listState(type: string, text: string) {
    const block = createBlock(type, {}, [createTextNode(text)], 'li1');
    return EditorState.create({ doc: createDocument([block]) });
  }

  it('Enter in a non-empty item creates another item of the same type', () => {
    for (const type of ['bullet_list_item', 'ordered_list_item']) {
      let state = listState(type, 'one');
      state = state.tr.setSelection(caret('li1', 3)).apply();
      state = state.tr.splitBlock().apply();
      state = typeInto(state, 'two');
      expect(summary(state.doc)).toEqual([[type, 'one'], [type, 'two']]);
    }
  });

  it('Enter in an empty item leaves the list instead of adding an item', () => {
    let state = listState('bullet_list_item', '');
    state = state.tr.setSelection(caret('li1', 0)).apply();
    state = state.tr.splitBlock().apply();
    expect(summary(state.doc)).toEqual([['paragraph', '']]);
  });

  it('Enter in a heading still creates a paragraph', () => {
    const block = createBlock('heading', { level: 1 }, [createTextNode('Title')], 'h');
    let state = EditorState.create({ doc: createDocument([block]) });
    state = state.tr.setSelection(caret('h', 5)).apply();
    state = state.tr.splitBlock().apply();
    expect(state.doc.blocks[1].type).toBe('paragraph');
  });

  it('Backspace at the start of an item turns it into a paragraph and keeps the text', () => {
    const doc = createDocument([
      createBlock('paragraph', {}, [createTextNode('before')], 'p'),
      createBlock('bullet_list_item', {}, [createTextNode('item')], 'li1'),
    ]);
    let state = EditorState.create({ doc });
    state = state.tr.setSelection(caret('li1', 0)).apply();
    state = state.tr.deleteBackward().apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'before'], ['paragraph', 'item']]);
    expect(state.selection.anchor).toEqual({ blockId: 'li1', offset: 0 });
  });
});

describe('links', () => {
  function textState(text: string) {
    const block = createBlock('paragraph', {}, [createTextNode(text)], 'p');
    return EditorState.create({ doc: createDocument([block]) });
  }

  const linkOf = (b: BlockNode) =>
    b.content.map((c) => [c.text, c.marks?.find((m) => m.type === 'link')?.attrs?.href ?? null]);

  it('setLink applies a link mark to the selection', () => {
    let state = textState('see docs here');
    state = state.tr.setSelection(range('p', 4, 8)).apply();
    state = state.tr.setLink('https://example.com').apply();
    expect(linkOf(state.doc.blocks[0])).toEqual([
      ['see ', null],
      ['docs', 'https://example.com'],
      [' here', null],
    ]);
  });

  it('setLink replaces an existing link instead of stacking', () => {
    let state = textState('docs');
    state = state.tr.setSelection(range('p', 0, 4)).apply();
    state = state.tr.setLink('https://a.example').apply();
    state = state.tr.setLink('https://b.example').apply();
    const marks = state.doc.blocks[0].content[0].marks!;
    expect(marks.filter((m) => m.type === 'link')).toEqual([{ type: 'link', attrs: { href: 'https://b.example' } }]);
  });

  it('setLink(null) removes the link', () => {
    let state = textState('docs');
    state = state.tr.setSelection(range('p', 0, 4)).apply();
    state = state.tr.setLink('https://a.example').apply();
    state = state.tr.setLink(null).apply();
    expect(linkOf(state.doc.blocks[0])).toEqual([['docs', null]]);
  });

  it('setLink ignores unsafe URLs', () => {
    let state = textState('docs');
    state = state.tr.setSelection(range('p', 0, 4)).apply();
    const tr = state.tr.setLink('javascript:alert(1)');
    expect(tr.docChanged).toBe(false);
  });

  it('getActiveLink reports the link under the selection', () => {
    const container = document.createElement('div');
    const editor = new LevitEditor({
      element: container,
      initialContent: {
        version: 1,
        blocks: [{ id: 'p', type: 'paragraph', content: [
          { text: 'go ' },
          { text: 'there', marks: [{ type: 'link', attrs: { href: 'https://x.example' } }] },
        ] }],
      },
    });
    editor.dispatch(editor.state.tr.setSelection(range('p', 3, 8)));
    expect(editor.getActiveLink()).toBe('https://x.example');
    editor.dispatch(editor.state.tr.setSelection(range('p', 0, 8)));
    expect(editor.getActiveLink()).toBeNull();
    editor.destroy();
  });
});

describe('chain commands', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('setBlockType changes the current block through the chain', () => {
    const editor = new LevitEditor({ element: container });
    editor.chain().setBlockType('blockquote').run();
    expect(editor.getJSON().blocks[0].type).toBe('blockquote');
    editor.destroy();
  });

  it('setLink and unsetLink work through the chain', () => {
    const editor = new LevitEditor({ element: container });
    editor.chain().insertText('docs').run();
    editor.dispatch(editor.state.tr.setSelection(range(editor.state.doc.blocks[0].id, 0, 4)));
    editor.chain().setLink('https://example.com').run();
    expect(editor.getActiveLink()).toBe('https://example.com');
    editor.chain().unsetLink().run();
    expect(editor.getActiveLink()).toBeNull();
    editor.destroy();
  });
});

describe('list rendering', () => {
  it('renders list items with markers and numbers ordered runs from 1', () => {
    const doc = createDocument([
      createBlock('ordered_list_item', {}, [createTextNode('a')], 'o1'),
      createBlock('ordered_list_item', {}, [createTextNode('b')], 'o2'),
      createBlock('paragraph', {}, [createTextNode('break')], 'p'),
      createBlock('ordered_list_item', {}, [createTextNode('c')], 'o3'),
      createBlock('bullet_list_item', {}, [createTextNode('d')], 'u1'),
    ]);
    const container = document.createElement('div');
    const reconciler = new DOMReconciler(container);
    reconciler.render(EditorState.create({ doc }));

    const el = (id: string) => container.querySelector(`[data-block-id="${id}"]`) as HTMLElement;
    expect(el('o1').classList.contains('levit-list-item')).toBe(true);
    expect(el('u1').classList.contains('levit-list-item')).toBe(true);
    expect(el('p').classList.contains('levit-list-item')).toBe(false);
    expect(['o1', 'o2', 'o3'].map((id) => el(id).getAttribute('data-number'))).toEqual(['1', '2', '1']);
    expect(el('u1').hasAttribute('data-number')).toBe(false);
  });

  it('renumbers when an item is inserted before others', () => {
    const container = document.createElement('div');
    const reconciler = new DOMReconciler(container);
    const items = ['x', 'y'].map((t, i) => createBlock('ordered_list_item', {}, [createTextNode(t)], `o${i}`));
    reconciler.render(EditorState.create({ doc: createDocument(items) }));

    const newFirst = createBlock('ordered_list_item', {}, [createTextNode('w')], 'new');
    reconciler.render(EditorState.create({ doc: createDocument([newFirst, ...items]) }));
    const numbers = [...container.children].map((c) => c.getAttribute('data-number'));
    expect(numbers).toEqual(['1', '2', '3']);
  });
});

describe('list serialization', () => {
  const doc = () => createDocument([
    createBlock('bullet_list_item', {}, [createTextNode('a')]),
    createBlock('bullet_list_item', {}, [createTextNode('b')]),
    createBlock('paragraph', {}, [createTextNode('x')]),
    createBlock('ordered_list_item', {}, [createTextNode('c')]),
    createBlock('ordered_list_item', {}, [createTextNode('d')]),
  ]);

  it('HTML export groups runs of items into ul/ol', () => {
    expect(documentToHTML(doc())).toBe(
      '<ul><li>a</li><li>b</li></ul><p>x</p><ol><li>c</li><li>d</li></ol>'
    );
  });

  it('HTML import turns ul/ol items into list blocks', () => {
    const parsed = htmlToDocument('<ul><li>a</li><li><strong>b</strong></li></ul><p>x</p><ol><li>c</li></ol>');
    expect(summary(parsed)).toEqual([
      ['bullet_list_item', 'a'],
      ['bullet_list_item', 'b'],
      ['paragraph', 'x'],
      ['ordered_list_item', 'c'],
    ]);
    expect(parsed.blocks[1].content[0].marks).toEqual([{ type: 'bold' }]);
  });

  it('Markdown export writes tight lists numbered from 1', () => {
    expect(documentToMarkdown(doc())).toBe('- a\n- b\n\nx\n\n1. c\n2. d');
  });

  it('Markdown import reads -, * and numbered lists', () => {
    const parsed = markdownToDocument('- a\n* b\n\nx\n\n1. c\n2. **d**');
    expect(summary(parsed)).toEqual([
      ['bullet_list_item', 'a'],
      ['bullet_list_item', 'b'],
      ['paragraph', 'x'],
      ['ordered_list_item', 'c'],
      ['ordered_list_item', 'd'],
    ]);
  });

  it('Markdown round-trips lists', () => {
    expect(summary(markdownToDocument(documentToMarkdown(doc())))).toEqual(summary(doc()));
  });
});
