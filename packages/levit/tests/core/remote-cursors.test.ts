import { describe, it, expect, beforeEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';
import { createRemoteCursors } from '../../src/plugins/remote-cursors';

let editor: LevitEditor;
let container: HTMLDivElement;

beforeEach(() => {
  document.body.textContent = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  editor = new LevitEditor({
    element: container,
    initialContent: createDocument([createBlock('paragraph', {}, [createTextNode('Hello world')], 'p')]),
  });
});

const at = (offset: number) => ({ blockId: 'p', offset });
const layer = () => document.querySelector('.levit-remote-cursors') as HTMLElement;

describe('createRemoteCursors', () => {
  it('draws a caret with a name for each other user, outside the editing area', () => {
    const cursors = createRemoteCursors(editor);
    cursors.set([
      { id: '1', name: 'Mina', color: '#e11d48', anchor: at(2), head: at(2) },
      { id: '2', name: 'Joon', color: 'rgb(37, 99, 235)', anchor: at(0), head: at(5) },
    ]);
    expect(layer()).not.toBeNull();
    expect(container.contains(layer())).toBe(false);
    expect(layer().getAttribute('aria-hidden')).toBe('true');
    const carets = layer().querySelectorAll('.levit-remote-caret');
    expect(carets).toHaveLength(2);
    expect([...layer().querySelectorAll('.levit-remote-name')].map((n) => n.textContent)).toEqual(['Mina', 'Joon']);
    expect((carets[0] as HTMLElement).style.getPropertyValue('--levit-remote-color')).toBe('#e11d48');
  });

  it('shows names as text and ignores colors that are not colors', () => {
    const cursors = createRemoteCursors(editor);
    cursors.set([{ id: '1', name: '<img src=x onerror=alert(1)>', color: 'red; background: url(https://evil.test)', anchor: at(1), head: at(1) }]);
    expect(layer().querySelector('img')).toBeNull();
    expect(layer().querySelector('.levit-remote-name')!.textContent).toBe('<img src=x onerror=alert(1)>');
    const caret = layer().querySelector('.levit-remote-caret') as HTMLElement;
    expect(caret.style.getPropertyValue('--levit-remote-color')).not.toContain('url');
  });

  it('leaves out cursors in blocks that do not exist, and removes cursors that are gone', () => {
    const cursors = createRemoteCursors(editor);
    cursors.set([
      { id: '1', name: 'A', color: 'red', anchor: at(1), head: at(1) },
      { id: '2', name: 'B', color: 'blue', anchor: { blockId: 'missing', offset: 0 }, head: { blockId: 'missing', offset: 0 } },
    ]);
    expect(layer().querySelectorAll('.levit-remote-caret')).toHaveLength(1);
    cursors.set([]);
    expect(layer().querySelectorAll('.levit-remote-caret')).toHaveLength(0);
  });

  it('moves a user’s caret instead of making a new one', () => {
    const cursors = createRemoteCursors(editor);
    cursors.set([{ id: '1', name: 'A', color: 'red', anchor: at(1), head: at(1) }]);
    const first = layer().querySelector('.levit-remote-caret');
    cursors.set([{ id: '1', name: 'A', color: 'red', anchor: at(4), head: at(4) }]);
    expect(layer().querySelector('.levit-remote-caret')).toBe(first);
  });

  it('is removed with destroy, and with the editor', () => {
    const cursors = createRemoteCursors(editor);
    cursors.set([{ id: '1', name: 'A', color: 'red', anchor: at(1), head: at(1) }]);
    cursors.destroy();
    expect(layer()).toBeNull();
    const again = createRemoteCursors(editor);
    again.set([{ id: '1', name: 'A', color: 'red', anchor: at(1), head: at(1) }]);
    editor.destroy();
    expect(layer()).toBeNull();
  });
});
