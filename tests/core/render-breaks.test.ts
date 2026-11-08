import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { EditorState } from '../../src/core/state/state';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { domSelectionToEditorSelection, restoreDOMSelection } from '../../src/core/view/selection';

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  container.contentEditable = 'true';
  document.body.appendChild(container);
});

function render(text: string, type = 'paragraph') {
  const doc = createDocument([createBlock(type, {}, [createTextNode(text)], 'b')]);
  const reconciler = new DOMReconciler(container);
  reconciler.render(EditorState.create({ doc }));
  return { reconciler, el: container.firstElementChild as HTMLElement };
}

describe('rendering line breaks', () => {
  it('keeps newlines in the text and shows them with white-space: pre-wrap', () => {
    const { el } = render('one\ntwo');
    expect(el.textContent).toBe('one\ntwo');
    const css = readFileSync(resolve(__dirname, '../../src/ui/theme.css'), 'utf8');
    expect(css).toMatch(/\.levit-block\s*\{[^}]*white-space:\s*pre-wrap/);
  });

  it('adds a <br> after a trailing newline so the empty last line is visible', () => {
    const { el } = render('end\n');
    expect(el.lastChild?.nodeName).toBe('BR');
    expect(el.textContent).toBe('end\n');
  });

  it('does not add a <br> when the text does not end with a newline', () => {
    const { el } = render('a\nb');
    expect(el.querySelector('br')).toBeNull();
  });

  it('maps the caret after a newline in both directions', () => {
    render('ab\ncd');
    restoreDOMSelection(container, {
      anchor: { blockId: 'b', offset: 3 },
      head: { blockId: 'b', offset: 3 },
      isCollapsed: true,
    });
    expect(domSelectionToEditorSelection(container)?.anchor).toEqual({ blockId: 'b', offset: 3 });
  });

  it('can place the caret on the empty line after a trailing newline', () => {
    render('end\n');
    restoreDOMSelection(container, {
      anchor: { blockId: 'b', offset: 4 },
      head: { blockId: 'b', offset: 4 },
      isCollapsed: true,
    });
    expect(domSelectionToEditorSelection(container)?.anchor).toEqual({ blockId: 'b', offset: 4 });
  });
});

describe('repairing the DOM', () => {
  it('render removes nodes the editor did not create', () => {
    const { reconciler } = render('text');
    container.appendChild(document.createTextNode('stray'));
    const div = document.createElement('div');
    div.textContent = 'junk';
    container.appendChild(div);

    const doc = createDocument([createBlock('paragraph', {}, [createTextNode('text')], 'b')]);
    reconciler.render(EditorState.create({ doc }));
    expect(container.textContent).toBe('text');
    expect(container.childNodes.length).toBe(1);
  });

  it('invalidate forces blocks to be rebuilt from the model', () => {
    const { reconciler, el } = render('model text');
    el.textContent = 'changed by the browser';

    const doc = createDocument([createBlock('paragraph', {}, [createTextNode('model text')], 'b')]);
    const state = EditorState.create({ doc });
    reconciler.render(state);
    expect(container.textContent).toBe('changed by the browser'); // snapshot unchanged, so no work

    reconciler.invalidate();
    reconciler.render(state);
    expect(container.textContent).toBe('model text');
  });
});
