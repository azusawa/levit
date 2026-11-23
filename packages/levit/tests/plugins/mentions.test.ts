import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { mentionsPlugin, getMentions, type MentionItem, type MentionsOptions } from '../../src/plugins/mentions';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { htmlToDocument } from '../../src/serializers/html';
import { ko } from '../../src/i18n/messages';
import type { BlockNode } from '../../src/core/model/types';

const people: MentionItem[] = [
  { id: 'u1', label: 'Kim Minsu', description: 'Design' },
  { id: 'u2', label: 'Lee Jiwoo' },
  { id: 'u3', label: 'Kim Haneul' },
];

let container: HTMLDivElement;
let editor: LevitEditor;

function setup(options: Partial<MentionsOptions> = {}, blocks: BlockNode[] = [createBlock('paragraph', {}, [], 'p')]) {
  editor = new LevitEditor({ element: container, initialContent: createDocument(blocks), plugins: [mentionsPlugin({ items: people, ...options })] });
}

const caret = (blockId: string, offset: number) =>
  editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true }));

function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  container.dispatchEvent(event);
  if (event.defaultPrevented) return;
  if (key === 'Enter') editor.dispatch(editor.state.tr.splitBlock());
  else if (key === 'Backspace') editor.chain().deleteBackward().run();
  else if (key === 'Delete') editor.chain().deleteForward().run();
  else if (key.length === 1) editor.dispatch(editor.state.tr.insertText(key));
}
const type = (text: string) => [...text].forEach(press);

const menu = () => document.querySelector<HTMLElement>('.levit-mention-menu')!;
const shown = () => Array.from(menu().querySelectorAll('.levit-autocomplete-title')).map((el) => el.textContent);
const content = (i = 0) => editor.state.doc.blocks[i].content;
const blockText = (i = 0) => getBlockText(editor.state.doc.blocks[i]);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  document.body.textContent = '';
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => editor?.destroy());

describe('mentions', () => {
  it('"@" lists the people whose name has what was typed, and picking one puts a mention in its place', () => {
    setup({}, [createBlock('paragraph', {}, [createTextNode('Hi ')], 'p')]);
    caret('p', 3);
    type('@');
    expect(shown()).toEqual(['Kim Minsu', 'Lee Jiwoo', 'Kim Haneul']);
    expect(menu().getAttribute('aria-label')).toBe('Mentions');
    type('kim h');
    expect(shown()).toEqual(['Kim Haneul']);
    press('Enter');
    expect(content()).toEqual([
      { text: 'Hi ', marks: [] },
      { text: '@Kim Haneul', marks: [{ type: 'mention', attrs: { id: 'u3', label: 'Kim Haneul' } }] },
      { text: ' ', marks: [] },
    ]);
    // The caret is after the space.
    expect(editor.state.selection.head).toEqual({ blockId: 'p', offset: 15 });
    // One undo takes the mention out again.
    editor.undo();
    expect(blockText()).toBe('Hi @kim h');
  });

  it('what is typed after a mention is plain text', () => {
    setup();
    caret('p', 0);
    type('@lee');
    press('Enter');
    type('ok');
    expect(content()[1]).toEqual({ text: ' ok', marks: [] });
  });

  it('draws a mention as a span with its id', () => {
    setup();
    caret('p', 0);
    type('@lee');
    press('Enter');
    const el = container.querySelector('.levit-mention')!;
    expect(el.textContent).toBe('@Lee Jiwoo');
    expect(el.getAttribute('data-mention-id')).toBe('u2');
  });

  it('does not add a second space before one that is already there', () => {
    setup({}, [createBlock('paragraph', {}, [createTextNode(' said')], 'p')]);
    caret('p', 0);
    type('@lee');
    press('Enter');
    expect(blockText()).toBe('@Lee Jiwoo said');
    expect(editor.state.selection.head.offset).toBe(11);
  });

  it('takes the people from a function, also a late one', async () => {
    const asked: string[] = [];
    setup({
      items: async (query) => {
        asked.push(query);
        return people.filter((p) => p.id === 'u2');
      },
    });
    caret('p', 0);
    type('@j');
    await flush();
    expect(asked).toEqual(['', 'j']);
    expect(shown()).toEqual(['Lee Jiwoo']);
  });

  it('Backspace after a mention and Delete before it remove it whole', () => {
    setup();
    caret('p', 0);
    type('@lee');
    press('Enter');
    type('x');
    caret('p', 10);
    press('Backspace');
    expect(blockText()).toBe(' x');
    editor.undo();
    caret('p', 0);
    press('Delete');
    expect(blockText()).toBe(' x');
    editor.undo();
    // Inside the mention too.
    caret('p', 4);
    press('Backspace');
    expect(blockText()).toBe(' x');
    // Elsewhere the keys work as usual.
    caret('p', 2);
    press('Backspace');
    expect(blockText()).toBe(' ');
  });

  it('getMentions lists the mentions in the document, in order', () => {
    setup();
    caret('p', 0);
    type('@lee');
    press('Enter');
    type('@kim m');
    press('Enter');
    expect(getMentions(editor)).toEqual([
      { id: 'u2', label: 'Lee Jiwoo', blockId: 'p', offset: 0 },
      { id: 'u1', label: 'Kim Minsu', blockId: 'p', offset: 11 },
    ]);
  });

  it('keeps mentions in HTML, and reads them back; Markdown has the name', () => {
    setup();
    caret('p', 0);
    type('@lee');
    press('Enter');
    const html = editor.getHTML();
    expect(html).toContain('<span class="levit-mention" data-mention-id="u2">@Lee Jiwoo</span>');
    expect(editor.getMarkdown().trim()).toBe('@Lee Jiwoo');
    const back = htmlToDocument(html, { plugins: editor.schema.plugins });
    expect(back.blocks[0].content[0]).toEqual({ text: '@Lee Jiwoo', marks: [{ type: 'mention', attrs: { id: 'u2', label: 'Lee Jiwoo' } }] });
  });

  it('escapes the id in HTML, and leaves out ids it cannot keep', () => {
    setup({ items: [{ id: '"><img src=x onerror=alert(1)>', label: 'Eve' }, { id: '', label: 'Nobody' }] });
    caret('p', 0);
    type('@eve');
    press('Enter');
    expect(editor.getHTML()).not.toContain('<img');
    expect(container.querySelector('img')).toBeNull();
    caret('p', blockText().length);
    type('@nob');
    press('Enter');
    // An empty id makes no mention.
    expect(getMentions(editor).map((m) => m.label)).toEqual(['Eve']);
  });

  it('uses the editor language for its name', () => {
    editor = new LevitEditor({ element: container, plugins: [mentionsPlugin({ items: people })], messages: ko });
    expect(menu().getAttribute('aria-label')).toBe('멘션');
  });

  it('goes away with the editor', () => {
    setup();
    editor.destroy();
    expect(document.querySelector('.levit-mention-menu')).toBeNull();
  });
});
