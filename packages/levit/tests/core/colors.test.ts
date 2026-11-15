import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EditorState } from '../../src/core/state/state';
import { LevitEditor } from '../../src/core/editor';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { COLORS, colorCSS, nearestColor, normalizeColor } from '../../src/core/model/colors';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown } from '../../src/serializers/markdown';
import { getDocumentSchema, validateDocument } from '../../src/ai/schema';
import type { DocumentData, InlineMark } from '../../src/core/model/types';
import type { LevitPlugin } from '../../src/core/plugin/plugin';

const marksOf = (doc: DocumentData) => doc.blocks[0].content.map((n) => [n.text, n.marks ?? []]);

function editorWith(text: string, from = 0, to = text.length) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const editor = new LevitEditor({
    element: el,
    initialContent: createDocument([createBlock('paragraph', {}, [createTextNode(text)], 'p')]),
  });
  editor.focus();
  editor.dispatch(
    editor.state.tr.setSelection({
      anchor: { blockId: 'p', offset: from },
      head: { blockId: 'p', offset: to },
      isCollapsed: from === to,
    })
  );
  return editor;
}

const render = (marks: InlineMark[]) => {
  const container = document.createElement('div');
  const doc = createDocument([createBlock('paragraph', {}, [createTextNode('hi', marks)])]);
  new DOMReconciler(container).render(EditorState.create({ doc }));
  return container;
};

const docWith = (marks: InlineMark[]) => createDocument([createBlock('paragraph', {}, [createTextNode('hi', marks)])]);

describe('colors', () => {
  it('has nine named colors', () => {
    expect(COLORS.map((c) => c.name)).toEqual(['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']);
  });

  it('accepts a color name or a hex color, and nothing else', () => {
    expect(normalizeColor('red')).toBe('red');
    expect(normalizeColor('brand-2')).toBe('brand-2');
    expect(normalizeColor('#E03131')).toBe('#e03131');
    expect(normalizeColor('#abc')).toBe('#aabbcc');
    for (const bad of ['', 'Red', 'red;background:url(x)', 'var(--x)', '#12345', 'rgb(1,2,3)', 'expression(alert(1))', 12, null]) {
      expect(normalizeColor(bad), String(bad)).toBeNull();
    }
  });

  it('gives a named color as a theme variable with the light value as fallback', () => {
    expect(colorCSS('red', 'text')).toBe('var(--levit-color-red, #b91c1c)');
    expect(colorCSS('blue', 'background')).toBe('var(--levit-bg-blue, #dbeafe)');
    expect(colorCSS('brand', 'text')).toBe('var(--levit-color-brand)');
    expect(colorCSS('#123456', 'text')).toBe('#123456');
    expect(colorCSS('red;x', 'text')).toBeNull();
  });

  it('finds the nearest named color for a pasted color', () => {
    expect(nearestColor('#ff0000', 'text')).toBe('red');
    expect(nearestColor('rgb(0, 0, 255)', 'text')).toBe('blue');
    expect(nearestColor('#00ff00', 'text')).toBe('green');
    expect(nearestColor('#ffa500', 'text')).toBe('orange');
    expect(nearestColor('#8b4513', 'text')).toBe('brown');
    expect(nearestColor('#800080', 'text')).toBe('purple');
    expect(nearestColor('#ff69b4', 'text')).toBe('pink');
    expect(nearestColor('#808080', 'text')).toBe('gray');
    expect(nearestColor('#ffff00', 'background')).toBe('yellow');
  });

  it('leaves black text and white backgrounds as the default', () => {
    expect(nearestColor('#000000', 'text')).toBeNull();
    expect(nearestColor('rgb(34, 34, 34)', 'text')).toBeNull();
    expect(nearestColor('#ffffff', 'background')).toBeNull();
    expect(nearestColor('transparent', 'background')).toBeNull();
    expect(nearestColor('rgba(255, 0, 0, 0)', 'background')).toBeNull();
  });
});

describe('text color commands', () => {
  it('colors the selected text', () => {
    const editor = editorWith('hello', 0, 2);
    editor.chain().setColor('red').run();
    expect(marksOf(editor.state.doc)).toEqual([
      ['he', [{ type: 'color', attrs: { color: 'red' } }]],
      ['llo', []],
    ]);
  });

  it('replaces the color, and removes it', () => {
    const editor = editorWith('hello');
    editor.chain().setColor('red').run();
    editor.chain().setColor('#123456').run();
    expect(marksOf(editor.state.doc)).toEqual([['hello', [{ type: 'color', attrs: { color: '#123456' } }]]]);
    editor.chain().unsetColor().run();
    expect(marksOf(editor.state.doc)).toEqual([['hello', []]]);
  });

  it('ignores a value that is not a color', () => {
    const editor = editorWith('hello');
    editor.chain().setColor('red;background:url(x)').run();
    expect(marksOf(editor.state.doc)).toEqual([['hello', []]]);
  });

  it('at a caret, colors what is typed next and keeps the other marks', () => {
    const editor = editorWith('hi', 2, 2);
    editor.chain().toggleBold().run();
    editor.chain().setColor('blue').run();
    editor.chain().insertText('!').run();
    expect(marksOf(editor.state.doc)).toEqual([
      ['hi', []],
      ['!', [{ type: 'bold' }, { type: 'color', attrs: { color: 'blue' } }]],
    ]);
  });

  it('tells the color of the selection', () => {
    const editor = editorWith('hello');
    expect(editor.getActiveColor('text')).toBeNull();
    editor.chain().setColor('green').run();
    expect(editor.getActiveColor('text')).toBe('green');
    editor.chain().setHighlight('pink').run();
    expect(editor.getActiveColor('background')).toBe('pink');
  });
});

describe('highlight colors', () => {
  it('highlights in a color, and plain highlight stays yellow', () => {
    const editor = editorWith('hello');
    editor.chain().setHighlight('blue').run();
    expect(marksOf(editor.state.doc)).toEqual([['hello', [{ type: 'highlight', attrs: { color: 'blue' } }]]]);
    editor.chain().setHighlight().run();
    expect(marksOf(editor.state.doc)).toEqual([['hello', [{ type: 'highlight' }]]]);
    editor.chain().unsetHighlight().run();
    expect(marksOf(editor.state.doc)).toEqual([['hello', []]]);
  });
});

describe('rendering colors', () => {
  it('draws colored text with the theme variable', () => {
    const span = render([{ type: 'color', attrs: { color: 'red' } }]).querySelector('span.levit-color') as HTMLElement;
    expect(span.textContent).toBe('hi');
    expect(span.dataset.color).toBe('red');
    expect(span.style.color).toBe('var(--levit-color-red, #b91c1c)');
  });

  it('draws a hex color as it is', () => {
    const span = render([{ type: 'color', attrs: { color: '#123456' } }]).querySelector('span.levit-color') as HTMLElement;
    expect(span.style.color).not.toBe('');
  });

  it('draws a colored highlight with the background variable', () => {
    const mark = render([{ type: 'highlight', attrs: { color: 'blue' } }]).querySelector('mark') as HTMLElement;
    expect(mark.dataset.color).toBe('blue');
    expect(mark.style.backgroundColor).toBe('var(--levit-bg-blue, #dbeafe)');
  });

  it('draws no style for a value that is not a color', () => {
    const container = render([{ type: 'color', attrs: { color: 'red;background:url(x)' } }]);
    expect(container.querySelector('[style]')).toBeNull();
    expect(container.textContent).toBe('hi');
  });
});

describe('colors in HTML', () => {
  it('writes the color name and a style that works without Levit', () => {
    expect(documentToHTML(docWith([{ type: 'color', attrs: { color: 'red' } }]))).toBe(
      '<p><span data-color="red" style="color: var(--levit-color-red, #b91c1c)">hi</span></p>'
    );
    expect(documentToHTML(docWith([{ type: 'highlight', attrs: { color: 'blue' } }]))).toBe(
      '<p><mark data-color="blue" style="background-color: var(--levit-bg-blue, #dbeafe)">hi</mark></p>'
    );
    expect(documentToHTML(docWith([{ type: 'color', attrs: { color: '#123456' } }]))).toBe(
      '<p><span data-color="#123456" style="color: #123456">hi</span></p>'
    );
  });

  it('writes no color for a value that is not one', () => {
    expect(documentToHTML(docWith([{ type: 'color', attrs: { color: '"><script>' } }]))).toBe('<p>hi</p>');
  });

  it('reads its own colors back', () => {
    for (const marks of [
      [{ type: 'color', attrs: { color: 'red' } }],
      [{ type: 'color', attrs: { color: '#123456' } }],
      [{ type: 'highlight', attrs: { color: 'blue' } }],
      [{ type: 'highlight' }],
    ]) {
      expect(marksOf(htmlToDocument(documentToHTML(docWith(marks))))).toEqual([['hi', marks]]);
    }
  });

  it('turns pasted colors into the nearest named color', () => {
    const doc = htmlToDocument(
      '<p><span style="color:#ff0000">a</span><span style="color:#000000">b</span><span style="background-color:#ffff00">c</span></p>'
    );
    expect(marksOf(doc)).toEqual([
      ['a', [{ type: 'color', attrs: { color: 'red' } }]],
      ['b', []],
      ['c', [{ type: 'highlight', attrs: { color: 'yellow' } }]],
    ]);
  });
});

describe('colors elsewhere', () => {
  it('Markdown keeps the text and drops the color', () => {
    expect(documentToMarkdown(docWith([{ type: 'color', attrs: { color: 'red' } }]))).toBe('hi');
    expect(documentToMarkdown(docWith([{ type: 'highlight', attrs: { color: 'blue' } }]))).toBe('==hi==');
  });

  it('the AI document schema allows colors, and only valid ones', () => {
    expect(JSON.stringify(getDocumentSchema())).toContain('"const":"color"');
    expect(validateDocument(docWith([{ type: 'color', attrs: { color: 'red' } }])).valid).toBe(true);
    expect(validateDocument(docWith([{ type: 'highlight', attrs: { color: '#123456' } }])).valid).toBe(true);
    expect(validateDocument(docWith([{ type: 'color', attrs: { color: 'red;x' } }])).valid).toBe(false);
  });

  it('theme.css defines each color for light and dark, with the same light values', () => {
    const css = readFileSync(resolve(__dirname, '../../src/ui/theme.css'), 'utf8');
    const root = /:root\s*\{([^}]*)\}/.exec(css)![1];
    const dark = /\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css)![1];
    for (const c of COLORS) {
      expect(root).toContain(`--levit-color-${c.name}: ${c.text};`);
      expect(root).toContain(`--levit-bg-${c.name}: ${c.background};`);
      expect(dark).toContain(`--levit-color-${c.name}:`);
      expect(dark).toContain(`--levit-bg-${c.name}:`);
    }
  });
});

describe('an app that adds its own color mark', () => {
  // Apps made before Levit had colors may add a "color" mark themselves.
  const plugin: LevitPlugin = {
    name: 'mine',
    marks: [
      {
        type: 'color',
        tag: 'span',
        attributes: (m) => ({ class: `mine-${m.attrs?.color}` }),
        toHTML: (t, m) => `<span class="mine-${m.attrs?.color}">${t}</span>`,
        parseHTML: (el) => (el.classList.contains('mine-red') ? { color: 'red' } : null),
      },
    ],
  };
  const red = [{ type: 'color', attrs: { color: 'red' } }];

  it('can still add it, and its mark is used instead', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const editor = new LevitEditor({ element: el, plugins: [plugin], initialContent: docWith(red) });
    expect(el.querySelector('span.mine-red')).not.toBeNull();
    expect(el.querySelector('.levit-color')).toBeNull();
    expect(documentToHTML(editor.state.doc, { plugins: [plugin] })).toBe('<p><span class="mine-red">hi</span></p>');
    expect(marksOf(htmlToDocument('<p><span class="mine-red" style="color: #0000ff">hi</span></p>', { plugins: [plugin] }))).toEqual([['hi', red]]);
    expect(validateDocument(docWith([{ type: 'color', attrs: { c: 1 } } as InlineMark]), { plugins: [plugin] }).valid).toBe(true);
  });
});
