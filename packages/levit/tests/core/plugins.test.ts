import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { LevitPlugin } from '../../src/core/plugin/plugin';
import type { BlockNode } from '../../src/core/model/types';

/** An editable block: a highlighted note. */
const callout: LevitPlugin = {
  name: 'callout',
  blocks: [
    {
      type: 'callout',
      tag: 'aside',
      className: 'my-callout',
      toHTML: (_block, content) => `<aside class="callout">${content}</aside>`,
      toMarkdown: (_block, text) => `> [!NOTE]\n> ${text}`,
      parseHTML: (el) => (el.tagName === 'ASIDE' && el.classList.contains('callout') ? {} : null),
      parseMarkdown: (raw) => {
        const m = /^> \[!NOTE\]\n> (.*)$/.exec(raw);
        return m ? { text: m[1] } : null;
      },
    },
  ],
  inputRules: [
    {
      match: /^!!!\s$/,
      handler: (tr, _match, blockId) => {
        tr.setBlockType('callout');
        const block = tr.doc.blocks.find((b) => b.id === blockId)!;
        block.content = [{ text: '', marks: [] }];
        tr.setSelection({ anchor: { blockId, offset: 0 }, head: { blockId, offset: 0 }, isCollapsed: true });
        return true;
      },
    },
  ],
  slashItems: [
    {
      id: 'callout',
      title: 'Callout',
      description: 'A highlighted note',
      icon: '💡',
      action: (editor) => editor.chain().setBlockType('callout').run(),
    },
  ],
};

/** A block without text, drawn by the plugin. */
const video: LevitPlugin = {
  name: 'video',
  blocks: [
    {
      type: 'video',
      atom: true,
      render: (block, el) => {
        const frame = document.createElement('div');
        frame.className = 'video-frame';
        frame.dataset.id = String(block.attrs?.id ?? '');
        el.appendChild(frame);
      },
      toHTML: (block) => `<div data-video="${block.attrs?.id}"></div>`,
      toMarkdown: (block) => `[video](${block.attrs?.id})`,
      parseHTML: (el) => (el.hasAttribute('data-video') ? { id: el.getAttribute('data-video') } : null),
    },
  ],
  commands: {
    insertVideo: (id: string) => (tr) => {
      tr.insertAtom('video', { id });
    },
  },
};

/** A mark with an attribute. */
const color: LevitPlugin = {
  name: 'color',
  marks: [
    {
      type: 'color',
      tag: 'span',
      attributes: (mark) => ({ style: `color: ${mark.attrs?.color}` }),
      toHTML: (text, mark) => `<span style="color: ${mark.attrs?.color}">${text}</span>`,
      parseHTML: (el) => {
        const c = (el as HTMLElement).style?.color;
        return el.tagName === 'SPAN' && c ? { color: c } : null;
      },
    },
  ],
  keymap: {
    'Mod-Shift-r': (editor) => editor.chain().toggleMark({ type: 'color', attrs: { color: 'red' } }).run(),
  },
};

let container: HTMLDivElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

function editorWith(blocks: BlockNode[], plugins: LevitPlugin[], element: HTMLElement = container) {
  const editor = new LevitEditor({ element, initialContent: createDocument(blocks), plugins });
  editor.focus();
  return editor;
}

const caret = (blockId: string, offset: number) => ({
  anchor: { blockId, offset },
  head: { blockId, offset },
  isCollapsed: true,
});

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);

describe('plugin blocks', () => {
  it('draws an editable plugin block with its tag and class', () => {
    editorWith([createBlock('callout', {}, [createTextNode('note')], 'c')], [callout]);
    const el = container.querySelector('[data-block-id="c"]')!;
    expect(el.tagName).toBe('ASIDE');
    expect(el.classList.contains('my-callout')).toBe(true);
    expect(el.classList.contains('levit-block-callout')).toBe(true);
    expect(el.textContent).toBe('note');
  });

  it('an atom plugin block is drawn by its render function and behaves like an image', () => {
    const editor = editorWith([para('a', 'x'), createBlock('video', { id: 'v1' }, [createTextNode('')], 'v'), para('b', 'y')], [video]);
    const el = container.querySelector('[data-block-id="v"]')!;
    expect(el.getAttribute('contenteditable')).toBe('false');
    expect(el.querySelector('.video-frame')?.getAttribute('data-id')).toBe('v1');

    editor.dispatch(editor.state.tr.setSelection(caret('b', 0)));
    editor.chain().deleteBackward().run();
    expect(editor.state.doc.blocks.map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('input rules from plugins run before the built-in ones', () => {
    const editor = editorWith([para('p', '')], [callout]);
    editor.dispatch(editor.state.tr.setSelection(caret('p', 0)));
    for (const ch of '!!! hi') editor.chain().insertText(ch).run();
    expect(editor.state.doc.blocks.map((b) => [b.type, getBlockText(b)])).toEqual([['callout', 'hi']]);
  });
});

describe('plugin marks', () => {
  it('draws a plugin mark with its tag and attributes', () => {
    editorWith([createBlock('paragraph', {}, [createTextNode('red', [{ type: 'color', attrs: { color: 'red' } }])])], [color]);
    const span = container.querySelector('span[style]') as HTMLElement;
    expect(span.textContent).toBe('red');
    expect(span.style.color).toBe('red');
    expect(span.getAttribute('data-mark')).toBe('color');
  });

  it('ignores event handler attributes from a mark', () => {
    const bad: LevitPlugin = {
      name: 'bad',
      marks: [{ type: 'bad', attributes: () => ({ onclick: 'alert(1)', title: 'ok' }) }],
    };
    editorWith([createBlock('paragraph', {}, [createTextNode('x', [{ type: 'bad' }])])], [bad]);
    const span = container.querySelector('[data-mark="bad"]')!;
    expect(span.hasAttribute('onclick')).toBe(false);
    expect(span.getAttribute('title')).toBe('ok');
  });
});

describe('plugin commands and keys', () => {
  it('editor.commands runs a plugin command at once; chain().exec() chains it', () => {
    const editor = editorWith([para('p', '')], [video]);
    editor.dispatch(editor.state.tr.setSelection(caret('p', 0)));
    expect(editor.commands.insertVideo('v1')).toBe(true);
    expect(editor.state.doc.blocks[0]).toMatchObject({ type: 'video', attrs: { id: 'v1' } });
    editor.chain().exec('insertVideo', 'v2').insertText('after').run();
    expect(editor.state.doc.blocks.map((b) => b.type)).toEqual(['video', 'video', 'paragraph']);
    expect(getBlockText(editor.state.doc.blocks[2])).toBe('after');
  });

  it('an unknown command name throws a clear error', () => {
    const editor = editorWith([para('p', '')], []);
    expect(() => editor.chain().exec('nope')).toThrow(/Unknown command "nope"/);
  });

  it('plugin shortcuts run on keydown', () => {
    const editor = editorWith([para('p', 'abc')], [color]);
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'p', offset: 0 }, head: { blockId: 'p', offset: 3 }, isCollapsed: false }));
    const e = new KeyboardEvent('keydown', { key: 'R', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true });
    container.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(editor.state.doc.blocks[0].content[0].marks).toEqual([{ type: 'color', attrs: { color: 'red' } }]);
  });

  it('a shortcut handler returning false lets the built-in key run', () => {
    const passthrough: LevitPlugin = { name: 'p', keymap: { 'Mod-b': () => false } };
    const editor = editorWith([para('p', 'abc')], [passthrough]);
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'p', offset: 0 }, head: { blockId: 'p', offset: 3 }, isCollapsed: false }));
    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(editor.state.doc.blocks[0].content[0].marks).toEqual([{ type: 'bold' }]);
  });
});

describe('plugin setup', () => {
  it('setup runs with the editor; its cleanup runs on destroy', () => {
    const cleanup = vi.fn();
    const setup = vi.fn(() => cleanup);
    const editor = editorWith([para('p', '')], [{ name: 'life', setup }]);
    expect(setup).toHaveBeenCalledWith(editor);
    editor.destroy();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('refuses plugins that redefine a built-in or each other', () => {
    expect(() => editorWith([para('p', '')], [{ name: 'x', blocks: [{ type: 'paragraph' }] }])).toThrow(/built in/);
    expect(() => editorWith([para('p', '')], [{ name: 'x', marks: [{ type: 'bold' }] }])).toThrow(/built in/);
    expect(() => editorWith([para('p', '')], [callout, { ...callout, name: 'callout2' }])).toThrow(/callout/);
  });

  it('slash menu shows items from plugins', () => {
    const editor = editorWith([para('p', '')], [callout]);
    const menu = createSlashMenu(editor);
    const item = menu.getItems().find((i) => i.id === 'callout');
    expect(item).toBeDefined();
    item!.action(editor);
    expect(editor.state.doc.blocks[0].type).toBe('callout');
    menu.destroy();
  });
});

describe('plugins in HTML and Markdown', () => {
  const doc = () =>
    createDocument([
      createBlock('callout', {}, [createTextNode('note')]),
      createBlock('video', { id: 'v1' }, [createTextNode('')]),
      createBlock('paragraph', {}, [createTextNode('red', [{ type: 'color', attrs: { color: 'red' } }])]),
    ]);
  const plugins = [callout, video, color];

  it('writes and reads HTML through the plugins', () => {
    const html = documentToHTML(doc(), { plugins });
    expect(html).toBe('<aside class="callout">note</aside><div data-video="v1"></div><p><span style="color: red">red</span></p>');
    const parsed = htmlToDocument(html, { plugins });
    expect(parsed.blocks.map((b) => [b.type, b.attrs, b.content.map((c) => c.marks)])).toEqual([
      ['callout', {}, [[]]],
      ['video', { id: 'v1' }, [[]]],
      ['paragraph', {}, [[{ type: 'color', attrs: { color: 'red' } }]]],
    ]);
  });

  it('writes and reads Markdown through the plugins', () => {
    const md = documentToMarkdown(doc(), { plugins });
    expect(md).toBe('> [!NOTE]\n> note\n\n[video](v1)\n\nred');
    const parsed = markdownToDocument('> [!NOTE]\n> hello', { plugins });
    expect(parsed.blocks.map((b) => [b.type, getBlockText(b)])).toEqual([['callout', 'hello']]);
  });

  it('without the plugins, unknown blocks are kept as plain paragraphs of text', () => {
    expect(documentToHTML(doc())).toBe('<p>note</p><p>red</p>');
  });

  it('editor.getHTML and getMarkdown use the editor plugins; paste reads them too', () => {
    const editor = editorWith(doc().blocks, plugins);
    expect(editor.getHTML()).toBe(documentToHTML(doc(), { plugins }));
    expect(editor.getMarkdown()).toBe(documentToMarkdown(doc(), { plugins }));

    const other = document.createElement('div');
    document.body.appendChild(other);
    const target = editorWith([para('p', '')], plugins, other);
    target.dispatch(target.state.tr.setSelection(caret('p', 0)));
    const dt = new DataTransfer();
    dt.setData('text/html', '<aside class="callout">pasted</aside><p>x</p>');
    other.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    expect(target.state.doc.blocks.map((b) => b.type)).toContain('callout');
  });
});
