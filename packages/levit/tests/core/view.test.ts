import { describe, it, expect, beforeEach } from 'vitest';
import { createDocument, createBlock, createTextNode } from '../../src/core/model/document';
import { EditorState } from '../../src/core/state/state';
import { DOMReconciler } from '../../src/core/view/reconciler';
import { domSelectionToEditorSelection, restoreDOMSelection } from '../../src/core/view/selection';

describe('DOM Reconciler & Selection Mapping', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.contentEditable = 'true';
    document.body.appendChild(container);
  });

  it('renders blocks into DOM semantic elements with data-block-id', () => {
    const doc = createDocument([
      createBlock('heading', { level: 1 }, [createTextNode('Title')], 'b1'),
      createBlock('paragraph', {}, [
        createTextNode('Hello '),
        createTextNode('World', [{ type: 'bold' }]),
      ], 'b2'),
    ]);
    const state = EditorState.create({ doc });
    const reconciler = new DOMReconciler(container);
    reconciler.render(state);

    expect(container.children.length).toBe(2);
    
    const h1 = container.children[0] as HTMLElement;
    expect(h1.tagName.toLowerCase()).toBe('h1');
    expect(h1.getAttribute('data-block-id')).toBe('b1');
    expect(h1.textContent).toBe('Title');

    const p = container.children[1] as HTMLElement;
    expect(p.tagName.toLowerCase()).toBe('p');
    expect(p.getAttribute('data-block-id')).toBe('b2');
    expect(p.querySelector('strong')?.textContent).toBe('World');
  });

  it('handles empty block with a <br> for cursor placement', () => {
    const state = EditorState.create(); // empty paragraph
    const reconciler = new DOMReconciler(container);
    reconciler.render(state);

    const p = container.children[0] as HTMLElement;
    expect(p.querySelector('br')).not.toBeNull();
  });

  it('updates only changed blocks on re-render', () => {
    const state1 = EditorState.create({
      doc: createDocument([
        createBlock('paragraph', {}, [createTextNode('Block 1')], 'b1'),
        createBlock('paragraph', {}, [createTextNode('Block 2')], 'b2'),
      ]),
    });
    const reconciler = new DOMReconciler(container);
    reconciler.render(state1);

    const b1DomBefore = container.children[0];
    const b2DomBefore = container.children[1];

    // Change only block 2
    const tr = state1.tr;
    tr.doc.blocks[1].content = [createTextNode('Block 2 Modified')];
    tr.docChanged = true;
    const state2 = state1.apply(tr);

    reconciler.render(state2);

    const b1DomAfter = container.children[0];
    const b2DomAfter = container.children[1];

    // Block 1 element identity should be preserved!
    expect(b1DomAfter).toBe(b1DomBefore);
    expect(b2DomAfter.textContent).toBe('Block 2 Modified');
  });

  it('correctly maps DOM Selection to EditorSelection and restores it', () => {
    const doc = createDocument([
      createBlock('paragraph', {}, [
        createTextNode('Hello '),
        createTextNode('World', [{ type: 'bold' }]),
      ], 'b1'),
    ]);
    const state = EditorState.create({ doc });
    const reconciler = new DOMReconciler(container);
    reconciler.render(state);

    // Place cursor inside <strong>World</strong> at offset 2 ('Wo|rld' -> block offset 6 + 2 = 8)
    const strong = container.querySelector('strong')!;
    const textNode = strong.firstChild!;
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode, 2);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    const editorSel = domSelectionToEditorSelection(container);
    expect(editorSel).not.toBeNull();
    expect(editorSel?.anchor.blockId).toBe('b1');
    expect(editorSel?.anchor.offset).toBe(8);

    // Now test restoring back to DOM
    restoreDOMSelection(container, {
      anchor: { blockId: 'b1', offset: 3 },
      head: { blockId: 'b1', offset: 3 },
      isCollapsed: true,
    });

    const activeRange = window.getSelection()?.getRangeAt(0);
    expect(activeRange?.startOffset).toBe(3);
  });
  it('maps selection boundaries that sit on inline elements, not text', () => {
    const doc = createDocument([
      createBlock('paragraph', {}, [
        createTextNode('read '),
        createTextNode('docs', [{ type: 'link', attrs: { href: 'https://x.example' } }]),
        createTextNode(' now'),
      ], 'b1'),
    ]);
    const reconciler = new DOMReconciler(container);
    reconciler.render(EditorState.create({ doc }));

    // Like a double-click on a link: the range is set on the <a> itself.
    const range = document.createRange();
    range.selectNodeContents(container.querySelector('a')!);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const editorSel = domSelectionToEditorSelection(container)!;
    expect(editorSel.anchor.offset).toBe(5);
    expect(editorSel.head.offset).toBe(9);
  });
});

