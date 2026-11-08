import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';

let container: HTMLDivElement;
let editor: LevitEditor;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  editor?.destroy();
  container.remove();
});

function setup(onChange = vi.fn()) {
  editor = new LevitEditor({
    element: container,
    initialContent: { version: 1, blocks: [{ id: 'a', type: 'paragraph', content: [{ text: 'model' }] }] },
    onChange,
  });
  return onChange;
}

const block = () => container.querySelector('[data-block-id="a"]')!;

describe('DOM guard', () => {
  it('puts back text that changed outside the editor', async () => {
    const onChange = setup();
    block().firstChild!.nodeValue = 'tampered';
    await flush();
    expect(block().textContent).toBe('model');
    expect(editor.getText()).toBe('model');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes nodes inserted outside the editor', async () => {
    setup();
    const font = document.createElement('font');
    font.textContent = 'junk';
    block().appendChild(font);
    container.appendChild(document.createElement('div'));
    await flush();
    expect(container.innerHTML).not.toContain('junk');
    expect(container.children.length).toBe(1);
  });

  it('puts back a block that was removed', async () => {
    setup();
    block().remove();
    await flush();
    expect(block()?.textContent).toBe('model');
  });

  it('leaves the DOM alone while an IME is composing', async () => {
    setup();
    container.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    block().firstChild!.nodeValue = 'modelㅎ';
    await flush();
    expect(block().textContent).toBe('modelㅎ');
  });

  it('cleans up after a cancelled composition', async () => {
    setup();
    container.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    block().firstChild!.nodeValue = 'modelㅎ';
    await flush();
    container.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    await flush();
    expect(block().textContent).toBe('model');
  });

  it("does not react to the editor's own updates", async () => {
    setup();
    const repair = vi.spyOn(editor, 'repairDOM');
    editor.chain().insertText('!').run();
    editor.undo();
    editor.redo();
    editor.setJSON({ version: 1, blocks: [{ id: 'a', type: 'paragraph', content: [{ text: 'new' }] }] });
    await flush();
    expect(repair).not.toHaveBeenCalled();
  });

  it('stops watching after destroy', async () => {
    setup();
    const repair = vi.spyOn(editor, 'repairDOM');
    editor.destroy();
    container.textContent = 'after';
    await flush();
    expect(repair).not.toHaveBeenCalled();
  });
});
