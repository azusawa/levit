import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { LevitEditor } from '../../src/core/editor';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { BlockNode, DocumentData } from '../../src/core/model/types';

function caret(blockId: string, offset: number) {
  return { anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true };
}

const item = (id: string, text: string, indent = 0, type = 'bullet_list_item') =>
  createBlock(type, indent ? { indent } : {}, [createTextNode(text)], id);

function stateWith(blocks: BlockNode[], sel = caret(blocks[0].id, 0)) {
  return EditorState.create({ doc: createDocument(blocks) }).tr.setSelection(sel).apply();
}

const indents = (doc: DocumentData) => doc.blocks.map((b) => b.attrs?.indent ?? 0);

describe('indenting list items', () => {
  it('Tab-indent nests an item under the item above it', () => {
    let state = stateWith([item('a', 'one'), item('b', 'two')], caret('b', 0));
    state = state.tr.indentListItem().apply();
    expect(indents(state.doc)).toEqual([0, 1]);
  });

  it('cannot nest more than one level deeper than the item above', () => {
    let state = stateWith([item('a', 'one'), item('b', 'two', 1)], caret('b', 0));
    state = state.tr.indentListItem().apply();
    expect(indents(state.doc)).toEqual([0, 1]);
  });

  it('does not indent the first item of a list', () => {
    const state = stateWith([createBlock('paragraph', {}, [createTextNode('p')], 'p'), item('a', 'one')], caret('a', 0));
    expect(state.tr.indentListItem().docChanged).toBe(false);
  });

  it('does nothing outside a list', () => {
    const state = stateWith([createBlock('paragraph', {}, [createTextNode('p')], 'p')]);
    expect(state.tr.indentListItem().docChanged).toBe(false);
  });

  it('outdent moves an item one level up and stops at the top level', () => {
    let state = stateWith([item('a', 'one'), item('b', 'two', 1)], caret('b', 0));
    state = state.tr.outdentListItem().apply();
    expect(indents(state.doc)).toEqual([0, 0]);
    expect(state.tr.outdentListItem().docChanged).toBe(false);
  });

  it('indents every selected item', () => {
    const blocks = [item('a', 'one'), item('b', 'two'), item('c', 'three')];
    let state = stateWith(blocks, {
      anchor: { blockId: 'b', offset: 0 },
      head: { blockId: 'c', offset: 2 },
      isCollapsed: false,
    });
    state = state.tr.indentListItem().apply();
    expect(indents(state.doc)).toEqual([0, 1, 1]);
  });

  it('outdenting an item also moves its children up', () => {
    const blocks = [item('a', 'one'), item('b', 'two', 1), item('c', 'child', 2), item('d', 'next', 1)];
    let state = stateWith(blocks, caret('b', 0));
    state = state.tr.outdentListItem().apply();
    expect(indents(state.doc)).toEqual([0, 0, 1, 1]);
  });

  it('Enter keeps the indent; Enter on an empty nested item outdents it', () => {
    let state = stateWith([item('a', 'one'), item('b', 'two', 1)], caret('b', 3));
    state = state.tr.splitBlock().apply();
    expect(indents(state.doc)).toEqual([0, 1, 1]);
    state = state.tr.splitBlock().apply();
    expect(state.doc.blocks.map((b) => b.type)).toEqual(['bullet_list_item', 'bullet_list_item', 'bullet_list_item']);
    expect(indents(state.doc)).toEqual([0, 1, 0]);
  });

  it('Backspace at the start of a nested item outdents it before leaving the list', () => {
    let state = stateWith([item('a', 'one'), item('b', 'two', 1)], caret('b', 0));
    state = state.tr.deleteBackward().apply();
    expect(indents(state.doc)).toEqual([0, 0]);
    expect(state.doc.blocks[1].type).toBe('bullet_list_item');
    state = state.tr.deleteBackward().apply();
    expect(state.doc.blocks[1].type).toBe('paragraph');
  });
});

describe('rendering nested lists', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('marks each item with its level', () => {
    const doc = createDocument([item('a', 'one'), item('b', 'two', 1)]);
    new DOMReconciler(container).render(EditorState.create({ doc }));
    const els = container.querySelectorAll<HTMLElement>('.levit-list-item');
    expect(els[0].hasAttribute('data-indent')).toBe(false);
    expect(els[1].getAttribute('data-indent')).toBe('1');
  });

  it('numbers each level separately', () => {
    const o = 'ordered_list_item';
    const doc = createDocument([
      item('a', 'a', 0, o),
      item('b', 'b', 1, o),
      item('c', 'c', 1, o),
      item('d', 'd', 0, o),
      item('e', 'e', 1, o),
    ]);
    new DOMReconciler(container).render(EditorState.create({ doc }));
    const numbers = Array.from(container.children).map((el) => el.getAttribute('data-number'));
    expect(numbers).toEqual(['1', '1', '2', '2', '1']);
  });
});

describe('nested lists in HTML and Markdown', () => {
  const doc = () =>
    createDocument([item('a', 'one'), item('b', 'two', 1), item('c', 'three', 2), item('d', 'four')]);

  it('exports nested <ul> elements', () => {
    expect(documentToHTML(doc())).toBe(
      '<ul><li>one<ul><li>two<ul><li>three</li></ul></li></ul></li><li>four</li></ul>'
    );
  });

  it('exports a numbered list nested in a bulleted one', () => {
    const d = createDocument([item('a', 'one'), item('b', 'two', 1, 'ordered_list_item')]);
    expect(documentToHTML(d)).toBe('<ul><li>one<ol><li>two</li></ol></li></ul>');
  });

  it('reads nested HTML lists back with their levels', () => {
    const parsed = htmlToDocument(documentToHTML(doc()));
    expect(parsed.blocks.map((b) => [getBlockText(b), b.attrs?.indent ?? 0])).toEqual([
      ['one', 0],
      ['two', 1],
      ['three', 2],
      ['four', 0],
    ]);
  });

  it('exports nested Markdown lists indented under their parent', () => {
    expect(documentToMarkdown(doc())).toBe('- one\n  - two\n    - three\n- four');
    const o = 'ordered_list_item';
    const d = createDocument([item('a', 'one', 0, o), item('b', 'two', 1, o), item('c', 'three', 0, o)]);
    expect(documentToMarkdown(d)).toBe('1. one\n   1. two\n2. three');
  });

  it('reads nested Markdown lists back with their levels', () => {
    const parsed = markdownToDocument('- one\n  - two\n    - three\n- four\n\n1. a\n   1. b\n2. c');
    expect(parsed.blocks.map((b) => [b.type, getBlockText(b), b.attrs?.indent ?? 0])).toEqual([
      ['bullet_list_item', 'one', 0],
      ['bullet_list_item', 'two', 1],
      ['bullet_list_item', 'three', 2],
      ['bullet_list_item', 'four', 0],
      ['ordered_list_item', 'a', 0],
      ['ordered_list_item', 'b', 1],
      ['ordered_list_item', 'c', 0],
    ]);
  });
});

describe('Tab and Shift+Tab', () => {
  function editorWith(blocks: BlockNode[]) {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return new LevitEditor({ element: el, initialContent: createDocument(blocks) });
  }

  const press = (editor: LevitEditor, key: string, shiftKey = false) => {
    const e = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    editor.container.dispatchEvent(e);
    return e;
  };

  it('Tab indents a list item and Shift+Tab outdents it', () => {
    const editor = editorWith([item('a', 'one'), item('b', 'two')]);
    editor.focus();
    editor.dispatch(editor.state.tr.setSelection(caret('b', 0)));
    expect(press(editor, 'Tab').defaultPrevented).toBe(true);
    expect(indents(editor.state.doc)).toEqual([0, 1]);
    press(editor, 'Tab', true);
    expect(indents(editor.state.doc)).toEqual([0, 0]);
  });

  it('Tab outside a list keeps the browser behavior (moving focus)', () => {
    const editor = editorWith([createBlock('paragraph', {}, [createTextNode('p')], 'p')]);
    editor.focus();
    expect(press(editor, 'Tab').defaultPrevented).toBe(false);
  });
});
