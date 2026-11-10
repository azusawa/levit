import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { LevitEditor } from '../../src/core/editor';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { domSelectionToEditorSelection, restoreDOMSelection } from '../../src/core/view/selection';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { BlockNode } from '../../src/core/model/types';

function caret(blockId: string, offset: number) {
  return { anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true };
}

const code = (id: string, text: string, language?: string) =>
  createBlock('code_block', language ? { language } : {}, [createTextNode(text)], id);

function editorWith(blocks: BlockNode[], options: Record<string, any> = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const editor = new LevitEditor({ element: el, initialContent: createDocument(blocks), ...options });
  editor.focus();
  return editor;
}

describe('code block language commands', () => {
  it('setCodeBlock turns the block into code with a language', () => {
    const editor = editorWith([createBlock('paragraph', {}, [createTextNode('x = 1')], 'p')]);
    editor.chain().setCodeBlock('python').run();
    expect(editor.state.doc.blocks[0]).toMatchObject({ type: 'code_block', attrs: { language: 'python' } });
  });

  it('setCodeLanguage changes or clears the language of the current code block', () => {
    const editor = editorWith([code('c', 'let a', 'js')]);
    editor.dispatch(editor.state.tr.setSelection(caret('c', 1)));
    editor.chain().setCodeLanguage('ts').run();
    expect(editor.state.doc.blocks[0].attrs).toEqual({ language: 'ts' });
    editor.chain().setCodeLanguage('').run();
    expect(editor.state.doc.blocks[0].attrs).toEqual({});
  });

  it('ignores language names that are not plain identifiers', () => {
    const editor = editorWith([code('c', 'x')]);
    editor.dispatch(editor.state.tr.setSelection(caret('c', 0)));
    editor.chain().setCodeLanguage('"><img src=x onerror=alert(1)>').run();
    expect(editor.state.doc.blocks[0].attrs).toEqual({});
  });

  it('Enter in a code block keeps the language on the same block', () => {
    const editor = editorWith([code('c', 'a', 'js')]);
    editor.dispatch(editor.state.tr.setSelection(caret('c', 1)));
    editor.chain().insertLineBreak().run();
    expect(editor.state.doc.blocks).toHaveLength(1);
    expect(editor.state.doc.blocks[0].attrs).toEqual({ language: 'js' });
  });
});

describe('rendering the language', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    container.contentEditable = 'true';
    document.body.appendChild(container);
  });

  it('shows the language in a label that is not part of the text', () => {
    new DOMReconciler(container).render(EditorState.create({ doc: createDocument([code('c', 'let a', 'js')]) }));
    const pre = container.querySelector('pre')!;
    expect(pre.getAttribute('data-language')).toBe('js');
    const label = pre.querySelector('.levit-code-language')!;
    expect(label.getAttribute('contenteditable')).toBe('false');
    expect(label.textContent).toBe('');
    expect(pre.textContent).toBe('let a');
    expect(pre.querySelector('code')!.className).toBe('language-js');
  });

  it('clicking the label asks for a new language (also the click a screen reader sends)', () => {
    const editor = editorWith([code('c', 'x', 'js')]);
    const prompt = vi.fn(() => 'rust');
    vi.stubGlobal('prompt', prompt);
    const label = editor.container.querySelector('.levit-code-language')!;
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    label.dispatchEvent(down);
    // Pressing does not move the caret; the click asks, once.
    expect(down.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    label.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt).toHaveBeenCalledWith('Code language', 'js');
    expect(editor.state.doc.blocks[0].attrs).toEqual({ language: 'rust' });
  });

  it('Alt+F10 in a code block moves focus to the label; Enter asks, Escape goes back', () => {
    const editor = editorWith([code('c', 'x', 'js')]);
    editor.dispatch(editor.state.tr.setSelection(caret('c', 1)));
    const prompt = vi.fn(() => 'go');
    vi.stubGlobal('prompt', prompt);
    const key = (target: Element, init: KeyboardEventInit) => {
      const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(e);
      return e;
    };
    expect(key(editor.container, { key: 'F10', altKey: true }).defaultPrevented).toBe(true);
    const label = editor.container.querySelector('.levit-code-language') as HTMLElement;
    expect(document.activeElement).toBe(label);

    key(label, { key: 'Enter' });
    expect(prompt).toHaveBeenCalledWith('Code language', 'js');
    // The key changed the language, not the code.
    expect(editor.state.doc.blocks[0]).toMatchObject({ attrs: { language: 'go' }, content: [{ text: 'x' }] });

    const again = editor.container.querySelector('.levit-code-language') as HTMLElement;
    again.focus();
    key(again, { key: 'Escape' });
    expect(editor.hasFocus()).toBe(true);
    expect(document.activeElement).not.toBe(again);
  });

  it('Alt+F10 outside a code block leaves the focus alone', () => {
    const editor = editorWith([createBlock('paragraph', {}, [createTextNode('p')], 'p'), code('c', 'x', 'js')]);
    editor.dispatch(editor.state.tr.setSelection(caret('p', 1)));
    editor.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true }));
    expect(document.activeElement).not.toBe(editor.container.querySelector('.levit-code-language'));
  });
});

describe('highlightCode hook', () => {
  const highlighter = vi.fn((text: string, language: string) =>
    text.replace(/\blet\b/g, `<span class="kw" data-lang="${language}">let</span>`)
  );

  it('renders the HTML the highlighter returns, keeping the text the same', () => {
    const editor = editorWith([code('c', 'let a = let', 'js')], { highlightCode: highlighter });
    const codeEl = editor.container.querySelector('code')!;
    expect(highlighter).toHaveBeenCalledWith('let a = let', 'js');
    expect(codeEl.querySelectorAll('span.kw')).toHaveLength(2);
    expect(codeEl.textContent).toBe('let a = let');
  });

  it('keeps caret mapping right inside highlighted code', () => {
    const editor = editorWith([code('c', 'let a = 1', 'js')], { highlightCode: highlighter });
    restoreDOMSelection(editor.container, caret('c', 5));
    expect(domSelectionToEditorSelection(editor.container)?.anchor).toEqual({ blockId: 'c', offset: 5 });
  });

  it('only keeps spans with class and style from the highlighter', () => {
    const editor = editorWith([code('c', 'x', 'js')], {
      highlightCode: () => '<span class="a" style="color: red" onclick="alert(1)"><img src=x onerror="alert(1)">x</span><script>alert(1)</script>',
    });
    const codeEl = editor.container.querySelector('code')!;
    expect(codeEl.innerHTML).toBe('<span class="a" style="color: red">x</span>');
  });

  it('falls back to plain text when the highlighter changes the text or throws', () => {
    const changed = editorWith([code('c', 'abc', 'js')], { highlightCode: () => '<span>xyz</span>' });
    expect(changed.container.querySelector('code')!.innerHTML).toBe('abc');
    const broken = editorWith([code('c', 'abc', 'js')], {
      highlightCode: () => {
        throw new Error('no grammar');
      },
    });
    expect(broken.container.querySelector('code')!.textContent).toBe('abc');
  });

  it('is not called for code blocks without a language', () => {
    const fn = vi.fn(() => '');
    editorWith([code('c', 'abc')], { highlightCode: fn });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('language in Markdown and HTML', () => {
  it('Markdown: ```lang', () => {
    const doc = createDocument([code('c', 'let a = 1', 'ts')]);
    expect(documentToMarkdown(doc)).toBe('```ts\nlet a = 1\n```');
    expect(markdownToDocument('```ts\nlet a = 1\n```').blocks[0]).toMatchObject({
      type: 'code_block',
      attrs: { language: 'ts' },
    });
  });

  it('HTML: <code class="language-x">, and the lang- and data-language forms', () => {
    const doc = createDocument([code('c', 'a < b', 'js')]);
    expect(documentToHTML(doc)).toBe('<pre><code class="language-js">a &lt; b</code></pre>');
    const langs = htmlToDocument(
      '<pre><code class="language-js">1</code></pre><pre class="lang-py"><code>2</code></pre>' +
      '<pre data-language="go">3</pre><pre><code class="hljs">4</code></pre>'
    ).blocks.map((b) => b.attrs?.language);
    expect(langs).toEqual(['js', 'py', 'go', undefined]);
  });
});
