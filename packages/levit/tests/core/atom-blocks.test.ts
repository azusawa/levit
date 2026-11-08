import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { LevitEditor } from '../../src/core/editor';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { applyInputRules } from '../../src/core/plugin/input-rules';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { sanitizeImageSrc } from '../../src/core/model/sanitize';
import { Schema } from '../../src/core/plugin/plugin';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { BlockNode, DocumentData } from '../../src/core/model/types';

function caret(blockId: string, offset: number) {
  return { anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true };
}

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const hr = (id: string) => createBlock('horizontal_rule', {}, [createTextNode('')], id);
const img = (id: string, src = 'https://x.test/a.png', alt = 'A') => createBlock('image', { src, alt }, [createTextNode('')], id);

function stateWith(blocks: BlockNode[], sel = caret(blocks[0].id, 0)) {
  return EditorState.create({ doc: createDocument(blocks) }).tr.setSelection(sel).apply();
}

const summary = (doc: DocumentData) => doc.blocks.map((b) => [b.type, getBlockText(b)]);
const types = (doc: DocumentData) => doc.blocks.map((b) => b.type);

describe('sanitizeImageSrc', () => {
  it.each([
    ['https://x.test/a.png', true],
    ['http://x.test/a.png', true],
    ['/img/a.png', true],
    ['a.png', true],
    ['blob:https://x.test/123', true],
    ['data:image/png;base64,iVBORw0KGgo=', true],
    ['data:image/svg+xml;base64,PHN2Zz4=', false],
    ['data:text/html,<script>', false],
    ['javascript:alert(1)', false],
    ['java\tscript:alert(1)', false],
    ['', false],
  ])('%s → allowed: %s', (src, ok) => {
    expect(sanitizeImageSrc(src) !== null).toBe(ok);
  });
});

describe('inserting a divider', () => {
  it('turns an empty paragraph into a divider and adds a paragraph after it', () => {
    let state = stateWith([para('a', '')]);
    state = state.tr.insertHorizontalRule().apply();
    expect(types(state.doc)).toEqual(['horizontal_rule', 'paragraph']);
    expect(state.selection.anchor).toEqual({ blockId: state.doc.blocks[1].id, offset: 0 });
  });

  it('goes after the block when the caret is at its end, into the next block', () => {
    let state = stateWith([para('a', 'one'), para('b', 'two')], caret('a', 3));
    state = state.tr.insertHorizontalRule().apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'one'], ['horizontal_rule', ''], ['paragraph', 'two']]);
    expect(state.selection.anchor).toEqual({ blockId: 'b', offset: 0 });
  });

  it('splits the block when the caret is in the middle', () => {
    let state = stateWith([para('a', 'onetwo')], caret('a', 3));
    state = state.tr.insertHorizontalRule().apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'one'], ['horizontal_rule', ''], ['paragraph', 'two']]);
  });

  it('"---" in an empty paragraph becomes a divider', () => {
    let state = EditorState.create();
    for (const ch of '---') {
      const tr = state.tr.insertText(ch);
      applyInputRules(tr);
      state = tr.apply();
    }
    expect(types(state.doc)).toEqual(['horizontal_rule', 'paragraph']);
  });
});

describe('inserting an image', () => {
  it('inserts an image block with src and alt', () => {
    let state = stateWith([para('a', '')]);
    state = state.tr.insertImage({ src: 'https://x.test/a.png', alt: 'cat' }).apply();
    expect(state.doc.blocks[0]).toMatchObject({ type: 'image', attrs: { src: 'https://x.test/a.png', alt: 'cat' } });
    expect(types(state.doc)).toEqual(['image', 'paragraph']);
  });

  it('refuses an unsafe src', () => {
    const state = stateWith([para('a', '')]);
    expect(state.tr.insertImage({ src: 'javascript:alert(1)' }).docChanged).toBe(false);
  });
});

describe('deleting next to dividers and images', () => {
  it('Backspace at the start of the block after it removes it', () => {
    let state = stateWith([para('a', 'one'), img('i'), para('b', 'two')], caret('b', 0));
    state = state.tr.deleteBackward().apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'one'], ['paragraph', 'two']]);
    expect(state.selection.anchor).toEqual({ blockId: 'b', offset: 0 });
  });

  it('Delete at the end of the block before it removes it', () => {
    let state = stateWith([para('a', 'one'), hr('h'), para('b', 'two')], caret('a', 3));
    state = state.tr.deleteForward().apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'one'], ['paragraph', 'two']]);
    expect(state.selection.anchor).toEqual({ blockId: 'a', offset: 3 });
  });

  it('deleting a selection that starts at an image removes the image', () => {
    let state = stateWith([img('i'), para('b', 'two')], {
      anchor: { blockId: 'i', offset: 0 },
      head: { blockId: 'b', offset: 1 },
      isCollapsed: false,
    });
    state = state.tr.deleteRange().apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'wo']]);
  });

  it('text typed while the caret is on an image goes into a new paragraph after it', () => {
    let state = stateWith([img('i')], caret('i', 0));
    state = state.tr.insertText('x').apply();
    expect(summary(state.doc)).toEqual([['image', ''], ['paragraph', 'x']]);
  });
});

describe('rendering dividers and images', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    container.contentEditable = 'true';
    document.body.appendChild(container);
  });

  function render(blocks: BlockNode[]) {
    new DOMReconciler(container).render(EditorState.create({ doc: createDocument(blocks) }));
    return Array.from(container.children) as HTMLElement[];
  }

  it('draws a divider as a non-editable <hr>', () => {
    const [el] = render([hr('h')]);
    expect(el.getAttribute('contenteditable')).toBe('false');
    expect(el.querySelector('hr')).not.toBeNull();
    expect(el.classList.contains('is-empty')).toBe(false);
  });

  it('draws an image as a non-editable figure', () => {
    const [el] = render([img('i', 'https://x.test/a.png', 'cat')]);
    expect(el.tagName).toBe('FIGURE');
    expect(el.getAttribute('contenteditable')).toBe('false');
    const image = el.querySelector('img')!;
    expect(image.getAttribute('src')).toBe('https://x.test/a.png');
    expect(image.getAttribute('alt')).toBe('cat');
  });

  it('does not render an unsafe src from JSON', () => {
    const [el] = render([img('i', 'javascript:alert(1)')]);
    expect(el.querySelector('img')?.hasAttribute('src') ?? false).toBe(false);
  });
});

describe('dividers and images in Markdown and HTML', () => {
  const doc = () => createDocument([para('a', 'top'), hr('h'), img('i', 'https://x.test/a.png', 'a cat'), para('b', 'end')]);

  it('Markdown: --- and ![alt](src)', () => {
    expect(documentToMarkdown(doc())).toBe('top\n\n---\n\n![a cat](https://x.test/a.png)\n\nend');
    expect(markdownToDocument(documentToMarkdown(doc())).blocks.map((b) => [b.type, b.attrs])).toEqual([
      ['paragraph', {}],
      ['horizontal_rule', {}],
      ['image', { src: 'https://x.test/a.png', alt: 'a cat' }],
      ['paragraph', {}],
    ]);
  });

  it('Markdown: an unsafe image stays text', () => {
    expect(types(markdownToDocument('![x](javascript:alert(1))'))).toEqual(['paragraph']);
  });

  it('HTML: <hr> and <img>, escaped', () => {
    const d = createDocument([hr('h'), img('i', 'https://x.test/a.png?a=1&b="2"', 'say "hi"')]);
    expect(documentToHTML(d)).toBe('<hr><img src="https://x.test/a.png?a=1&amp;b=&quot;2&quot;" alt="say &quot;hi&quot;">');
    expect(htmlToDocument(documentToHTML(d)).blocks.map((b) => [b.type, b.attrs])).toEqual([
      ['horizontal_rule', {}],
      ['image', { src: 'https://x.test/a.png?a=1&b="2"', alt: 'say "hi"' }],
    ]);
  });

  it('HTML: images inside paragraphs, links and figures are pulled out as blocks', () => {
    const parsed = htmlToDocument(
      '<p>before<img src="https://x.test/1.png" alt="one">after</p>' +
      '<a href="https://x.test"><img src="https://x.test/2.png"></a>' +
      '<figure><img src="https://x.test/3.png"><figcaption>cap</figcaption></figure>' +
      '<img src="javascript:alert(1)"><img src="data:image/svg+xml;base64,PHN2Zz4=">'
    );
    expect(parsed.blocks.map((b) => (b.type === 'image' ? b.attrs!.src : getBlockText(b)))).toEqual([
      'before',
      'https://x.test/1.png',
      'after',
      'https://x.test/2.png',
      'https://x.test/3.png',
      'cap',
    ]);
  });
});

describe('image uploads', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  function pasteFiles(files: File[]) {
    const data = { types: ['Files'], files, items: [], getData: () => '' };
    const ev = new ClipboardEvent('paste', { cancelable: true, bubbles: true });
    Object.defineProperty(ev, 'clipboardData', { value: data });
    container.dispatchEvent(ev);
    return ev;
  }

  it('uploads pasted image files and inserts the returned URLs', async () => {
    const uploadImage = vi.fn(async (file: File) => `https://cdn.test/${file.name}`);
    const editor = new LevitEditor({ element: container, uploadImage });
    editor.focus();
    const ev = pasteFiles([new File(['x'], 'a.png', { type: 'image/png' }), new File(['y'], 'notes.txt', { type: 'text/plain' })]);
    expect(ev.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(types(editor.state.doc)).toContain('image'));
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(editor.state.doc.blocks[0].attrs).toEqual({ src: 'https://cdn.test/a.png', alt: 'a.png' });
  });

  it('ignores pasted files when no upload function is set', () => {
    const editor = new LevitEditor({ element: container });
    editor.focus();
    pasteFiles([new File(['x'], 'a.png', { type: 'image/png' })]);
    expect(types(editor.state.doc)).toEqual(['paragraph']);
  });

  it('a failed upload changes nothing and is reported through onError', async () => {
    const onError = vi.fn();
    const editor = new LevitEditor({
      element: container,
      uploadImage: async () => {
        throw new Error('offline');
      },
      onError,
    });
    editor.focus();
    pasteFiles([new File(['x'], 'a.png', { type: 'image/png' })]);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(types(editor.state.doc)).toEqual(['paragraph']);
  });
});

describe('slash menu', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('Divider inserts a divider', () => {
    const editor = new LevitEditor({ element: container });
    const menu = createSlashMenu(editor);
    menu.getItems().find((i) => i.id === 'divider')!.action(editor);
    expect(types(editor.state.doc)).toEqual(['horizontal_rule', 'paragraph']);
    menu.destroy();
  });

  it('Image asks for a URL when no upload function is set', () => {
    const editor = new LevitEditor({ element: container });
    const menu = createSlashMenu(editor);
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('https://x.test/a.png');
    menu.getItems().find((i) => i.id === 'image')!.action(editor);
    expect(prompt).toHaveBeenCalled();
    expect(editor.state.doc.blocks[0]).toMatchObject({ type: 'image', attrs: { src: 'https://x.test/a.png' } });
    prompt.mockRestore();
    menu.destroy();
  });
});

describe('selections that start or end between blocks', () => {
  it('maps points on the editor itself to the block edges (select all with an image first)', async () => {
    const { domPointToPosition } = await import('../../src/core/view/selection');
    const container = document.createElement('div');
    document.body.appendChild(container);
    new DOMReconciler(container).render(
      EditorState.create({ doc: createDocument([img('i'), para('b', 'text')]) })
    );
    expect(domPointToPosition(container, container, 0)).toEqual({ blockId: 'i', offset: 0 });
    expect(domPointToPosition(container, container, 2)).toEqual({ blockId: 'b', offset: 4 });
  });
});

describe('select all', () => {
  it('Mod+A selects the whole document, also when it starts and ends with images', async () => {
    const { restoreDOMSelection } = await import('../../src/core/view/selection');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = new LevitEditor({
      element: container,
      initialContent: createDocument([img('i'), para('b', 'text'), img('j')]),
    });
    editor.focus();
    editor.dispatch(editor.state.tr.setSelection(caret('b', 2)));
    const e = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true });
    container.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(editor.state.selection).toEqual({
      anchor: { blockId: 'i', offset: 0 },
      head: { blockId: 'j', offset: 0 },
      isCollapsed: false,
    });

    // Images are not editable, so the DOM range goes around them.
    restoreDOMSelection(container, editor.state.selection);
    const range = getSelection()!.getRangeAt(0);
    expect([range.startContainer, range.startOffset]).toEqual([container, 0]);
    expect([range.endContainer, range.endOffset]).toEqual([container, 3]);
  });
});

describe('pasting HTML that is only an image', () => {
  it('inserts the image (copying an image from a web page)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const editor = new LevitEditor({ element: container });
    editor.focus();
    const dt = new DataTransfer();
    dt.setData('text/html', '<meta charset="utf-8"><img src="https://x.test/a.png" alt="cat">');
    container.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    expect(editor.state.doc.blocks[0]).toMatchObject({ type: 'image', attrs: { src: 'https://x.test/a.png', alt: 'cat' } });
  });
});

describe('insertFragment with an image', () => {
  it('splits the line around a pasted image and puts the caret after it', () => {
    let state = stateWith([para('a', 'abcd')], caret('a', 2));
    state = state.tr.insertFragment([img('x')]).apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'ab'], ['image', ''], ['paragraph', 'cd']]);
    expect(state.selection.anchor).toEqual({ blockId: state.doc.blocks[2].id, offset: 0 });
  });

  it('an image pasted into an empty paragraph replaces it', () => {
    let state = stateWith([para('a', '')], caret('a', 0));
    state = state.tr.insertFragment([img('x')]).apply();
    expect(types(state.doc)).toEqual(['image', 'paragraph']);
  });
});

describe('review fixes: insertAtom', () => {
  it('does nothing for a type that is not an atom', () => {
    const state = stateWith([para('a', '')]);
    expect(state.tr.insertAtom('paragraph', {}).docChanged).toBe(false);
    expect(state.tr.insertAtom('unknown', {}).docChanged).toBe(false);
  });

  it('checks an image src like insertImage does', () => {
    const state = stateWith([para('a', '')]);
    expect(state.tr.insertAtom('image', { src: 'javascript:alert(1)' }).docChanged).toBe(false);
    const ok = state.tr.insertAtom('image', { src: 'https://x.test/a.png' });
    expect(ok.doc.blocks[0].attrs).toEqual({ src: 'https://x.test/a.png' });
  });
});

describe('review fixes: pasting text then an image', () => {
  it('joins the first pasted text to the left half of the line', () => {
    let state = stateWith([para('a', 'abcd')], caret('a', 2));
    state = state.tr.insertFragment([para('x', 'XY'), img('i')]).apply();
    expect(summary(state.doc)).toEqual([['paragraph', 'abXY'], ['image', ''], ['paragraph', 'cd']]);
  });

  it('an image pasted into an empty heading leaves no empty heading behind', () => {
    let state = stateWith([createBlock('heading', { level: 1 }, [createTextNode('')], 'h')], caret('h', 0));
    state = state.tr.insertFragment([img('i')]).apply();
    expect(types(state.doc)).toEqual(['image', 'heading']);
  });
});

describe('review fixes: a reused element that stops being an atom', () => {
  it('becomes editable again', () => {
    const container = document.createElement('div');
    const plugins = [{ name: 'card', blocks: [{ type: 'card', atom: true, tag: 'p' }] }];
    const schema = new Schema(plugins);
    const reconciler = new DOMReconciler(container, { schema });
    reconciler.render(EditorState.create({ doc: createDocument([createBlock('card', {}, [createTextNode('')], 'c')]), schema }));
    expect(container.firstElementChild!.getAttribute('contenteditable')).toBe('false');
    reconciler.render(EditorState.create({ doc: createDocument([para('c', 'text')]), schema }));
    expect(container.firstElementChild!.hasAttribute('contenteditable')).toBe(false);
    expect(container.firstElementChild!.classList.contains('levit-atom')).toBe(false);
  });
});
