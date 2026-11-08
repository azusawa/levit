import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { LevitEditor } from '../../src/core/editor';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { DocumentData } from '../../src/core/model/types';

const marked = (doc: DocumentData) =>
  doc.blocks[0].content.map((n) => [n.text, (n.marks ?? []).map((m) => m.type)]);

function editorWith(text: string) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const editor = new LevitEditor({
    element: el,
    initialContent: createDocument([createBlock('paragraph', {}, [createTextNode(text)], 'p')]),
  });
  editor.focus();
  editor.dispatch(
    editor.state.tr.setSelection({
      anchor: { blockId: 'p', offset: 0 },
      head: { blockId: 'p', offset: text.length },
      isCollapsed: false,
    })
  );
  return editor;
}

const press = (editor: LevitEditor, key: string) => {
  const e = new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
  editor.container.dispatchEvent(e);
  return e;
};

describe('strikethrough and highlight shortcuts', () => {
  it('Mod+Shift+X toggles strikethrough', () => {
    const editor = editorWith('gone');
    expect(press(editor, 'X').defaultPrevented).toBe(true);
    expect(marked(editor.state.doc)).toEqual([['gone', ['strike']]]);
  });

  it('Mod+Shift+H toggles highlight', () => {
    const editor = editorWith('look');
    press(editor, 'H');
    expect(marked(editor.state.doc)).toEqual([['look', ['highlight']]]);
    editor.chain().toggleHighlight().run();
    expect(marked(editor.state.doc)).toEqual([['look', []]]);
  });
});

describe('rendering highlight', () => {
  it('draws highlighted text in a <mark>', () => {
    const container = document.createElement('div');
    const doc = createDocument([createBlock('paragraph', {}, [createTextNode('hi', [{ type: 'highlight' }])])]);
    new DOMReconciler(container).render(EditorState.create({ doc }));
    const mark = container.querySelector('mark');
    expect(mark?.textContent).toBe('hi');
    expect(mark?.className).toBe('levit-highlight');
  });
});

describe('strike and highlight in Markdown and HTML', () => {
  const doc = () =>
    createDocument([
      createBlock('paragraph', {}, [
        createTextNode('a '),
        createTextNode('old', [{ type: 'strike' }]),
        createTextNode(' '),
        createTextNode('key', [{ type: 'highlight' }]),
      ]),
    ]);

  it('writes ~~strike~~ and ==highlight== in Markdown and reads them back', () => {
    expect(documentToMarkdown(doc())).toBe('a ~~old~~ ==key==');
    expect(marked(markdownToDocument('a ~~old~~ ==key=='))).toEqual(marked(doc()));
  });

  it('writes <mark> in HTML and reads it back', () => {
    expect(documentToHTML(doc())).toBe('<p>a <s>old</s> <mark>key</mark></p>');
    expect(marked(htmlToDocument(documentToHTML(doc())))).toEqual(marked(doc()));
  });
});

describe('bubble menu', () => {
  let editor: LevitEditor;
  beforeEach(() => {
    editor = editorWith('text');
  });

  it.each([
    ['Strikethrough', 'strike'],
    ['Highlight', 'highlight'],
  ])('has a %s button', (label, mark) => {
    const menu = createBubbleMenu(editor);
    const button = menu.element.querySelector(`button[aria-label="${label}"]`);
    expect(button).not.toBeNull();
    button!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(marked(editor.state.doc)).toEqual([['text', [mark]]]);
    menu.destroy();
  });
});
