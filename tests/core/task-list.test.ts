import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { LevitEditor } from '../../src/core/editor';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { applyInputRules } from '../../src/core/plugin/input-rules';
import { domSelectionToEditorSelection, restoreDOMSelection } from '../../src/core/view/selection';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { BlockNode, DocumentData } from '../../src/core/model/types';

function caret(blockId: string, offset: number) {
  return { anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true };
}

const task = (id: string, text: string, checked = false, extra: Record<string, any> = {}) =>
  createBlock('task_list_item', { checked, ...extra }, [createTextNode(text)], id);

function stateWith(blocks: BlockNode[], sel = caret(blocks[0].id, 0)) {
  return EditorState.create({ doc: createDocument(blocks) }).tr.setSelection(sel).apply();
}

function typeInto(state: EditorState, text: string): EditorState {
  for (const ch of text) {
    const tr = state.tr.insertText(ch);
    applyInputRules(tr);
    state = tr.apply();
  }
  return state;
}

const tasks = (doc: DocumentData) =>
  doc.blocks.map((b) => [b.type, getBlockText(b), b.attrs?.checked ?? null]);

describe('task list editing', () => {
  it.each([
    ['[] ', false],
    ['[ ] ', false],
    ['[x] ', true],
    ['[X] ', true],
  ])('"%s" starts a task item', (trigger, checked) => {
    const state = typeInto(EditorState.create(), `${trigger}buy milk`);
    expect(tasks(state.doc)).toEqual([['task_list_item', 'buy milk', checked]]);
  });

  it('"[ ] " in a bulleted item turns it into a task item', () => {
    const state = typeInto(EditorState.create(), '- [ ] a');
    expect(tasks(state.doc)).toEqual([['task_list_item', 'a', false]]);
  });

  it('Enter makes a new unchecked task, Enter on an empty task leaves the list', () => {
    let state = stateWith([task('a', 'done', true)], caret('a', 4));
    state = state.tr.splitBlock().apply();
    expect(tasks(state.doc)).toEqual([
      ['task_list_item', 'done', true],
      ['task_list_item', '', false],
    ]);
    state = state.tr.splitBlock().apply();
    expect(state.doc.blocks[1].type).toBe('paragraph');
  });

  it('Enter in a nested task keeps the level but not the check', () => {
    let state = stateWith([task('a', 'one'), task('b', 'two', true, { indent: 1 })], caret('b', 3));
    state = state.tr.splitBlock().apply();
    expect(state.doc.blocks[2].attrs).toEqual({ checked: false, indent: 1 });
  });

  it('toggleTaskChecked flips the current task, or a given one', () => {
    let state = stateWith([task('a', 'one'), task('b', 'two')], caret('a', 0));
    state = state.tr.toggleTaskChecked().apply();
    state = state.tr.toggleTaskChecked('b').apply();
    expect(tasks(state.doc).map((t) => t[2])).toEqual([true, true]);
    state = state.tr.toggleTaskChecked('a').apply();
    expect(tasks(state.doc).map((t) => t[2])).toEqual([false, true]);
  });

  it('toggleTaskChecked does nothing outside a task item', () => {
    const state = stateWith([createBlock('paragraph', {}, [createTextNode('p')], 'p')]);
    expect(state.tr.toggleTaskChecked().docChanged).toBe(false);
  });

  it('Backspace at the start of a task item leaves the list', () => {
    let state = stateWith([task('a', 'one', true)], caret('a', 0));
    state = state.tr.deleteBackward().apply();
    expect(state.doc.blocks[0].type).toBe('paragraph');
    expect(state.doc.blocks[0].attrs).toEqual({});
  });
});

describe('rendering task items', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    container.contentEditable = 'true';
    document.body.appendChild(container);
  });

  function render(blocks: BlockNode[]) {
    new DOMReconciler(container).render(EditorState.create({ doc: createDocument(blocks) }));
  }

  it('draws a checkbox that is not part of the text', () => {
    render([task('a', 'one', true), task('b', '')]);
    const [done, empty] = Array.from(container.children) as HTMLElement[];
    const box = done.querySelector('.levit-task-checkbox')!;
    expect(box.getAttribute('contenteditable')).toBe('false');
    expect(box.getAttribute('role')).toBe('checkbox');
    expect(box.getAttribute('aria-checked')).toBe('true');
    expect(done.getAttribute('data-checked')).toBe('true');
    expect(done.textContent).toBe('one');
    expect(empty.querySelector('.levit-task-checkbox')?.getAttribute('aria-checked')).toBe('false');
  });

  it('maps caret positions as if the checkbox were not there', () => {
    render([task('a', 'one')]);
    restoreDOMSelection(container, caret('a', 2));
    expect(domSelectionToEditorSelection(container)?.anchor).toEqual({ blockId: 'a', offset: 2 });
  });

  it('puts the caret after the checkbox in an empty task', () => {
    render([task('a', '')]);
    restoreDOMSelection(container, caret('a', 0));
    const range = getSelection()!.getRangeAt(0);
    const block = container.firstElementChild!;
    expect(range.startContainer).toBe(block);
    expect(block.childNodes[range.startOffset - 1]).toBe(block.querySelector('.levit-task-checkbox'));
  });
});

describe('clicking a checkbox', () => {
  it('toggles the task and keeps the caret where it was', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new LevitEditor({
      element: el,
      initialContent: createDocument([createBlock('paragraph', {}, [createTextNode('p')], 'p'), task('t', 'one')]),
    });
    editor.focus();
    const box = el.querySelector('.levit-task-checkbox')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    box.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(editor.state.doc.blocks[1].attrs?.checked).toBe(true);
    expect(editor.state.selection.anchor.blockId).toBe('p');
    expect(el.querySelector('.levit-task-checkbox')!.getAttribute('aria-checked')).toBe('true');
  });

  it('Mod+Enter toggles the task at the caret', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new LevitEditor({ element: el, initialContent: createDocument([task('t', 'one')]) });
    editor.focus();
    editor.dispatch(editor.state.tr.setSelection(caret('t', 1)));
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.state.doc.blocks.length).toBe(1);
    expect(editor.state.doc.blocks[0].attrs?.checked).toBe(true);
  });
});

describe('task lists in Markdown and HTML', () => {
  const doc = () => createDocument([task('a', 'todo'), task('b', 'done', true), task('c', 'sub', false, { indent: 1 })]);

  it('writes GitHub-style Markdown task lists', () => {
    expect(documentToMarkdown(doc())).toBe('- [ ] todo\n- [x] done\n  - [ ] sub');
  });

  it('reads Markdown task lists back', () => {
    const parsed = markdownToDocument('- [ ] todo\n- [x] done\n  - [ ] sub\n* [X] star');
    expect(parsed.blocks.map((b) => [b.type, getBlockText(b), b.attrs?.checked, b.attrs?.indent ?? 0])).toEqual([
      ['task_list_item', 'todo', false, 0],
      ['task_list_item', 'done', true, 0],
      ['task_list_item', 'sub', false, 1],
      ['task_list_item', 'star', true, 0],
    ]);
  });

  it('writes HTML checkboxes in a list of their own', () => {
    const d = createDocument([createBlock('bullet_list_item', {}, [createTextNode('b')], 'x'), task('a', 'todo'), task('b', 'done', true)]);
    expect(documentToHTML(d)).toBe(
      '<ul><li>b</li></ul>' +
      '<ul class="levit-task-list"><li data-checked="false"><input type="checkbox" disabled>todo</li>' +
      '<li data-checked="true"><input type="checkbox" disabled checked>done</li></ul>'
    );
  });

  it('reads HTML checkbox lists, including Levit and GitHub output', () => {
    const parsed = htmlToDocument(documentToHTML(doc()));
    expect(tasks(parsed)).toEqual(tasks(doc()));
    const github = htmlToDocument(
      '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled="" checked=""> shipped</li><li>plain</li></ul>'
    );
    expect(tasks(github)).toEqual([
      ['task_list_item', 'shipped', true],
      ['bullet_list_item', 'plain', null],
    ]);
  });
});
