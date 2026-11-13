import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createSlashMenu } from '../../src/plugins/slash-menu';
import { createBlock, createDocument, createTextNode } from '../../src/core/model/document';

describe('Floating Menus (Bubble Menu & Slash Menu)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('creates and attaches bubble menu element', () => {
    const editor = new LevitEditor({ element: container });
    const bubbleMenu = createBubbleMenu(editor);

    expect(bubbleMenu.element).toBeDefined();
    expect(bubbleMenu.element.classList.contains('levit-bubble-menu')).toBe(true);

    bubbleMenu.destroy();
    editor.destroy();
  });

  it('the bubble menu turns the selected lines into a table', () => {
    const editor = new LevitEditor({
      element: container,
      initialContent: createDocument([
        createBlock('paragraph', {}, [createTextNode('Name\tPrice')], 'a'),
        createBlock('paragraph', {}, [createTextNode('Tea\t3')], 'b'),
      ]),
    });
    const bubbleMenu = createBubbleMenu(editor);
    editor.focus();
    editor.dispatch(editor.state.tr.setSelection({ anchor: { blockId: 'a', offset: 0 }, head: { blockId: 'b', offset: 5 }, isCollapsed: false }));
    const button = bubbleMenu.element.querySelector('button[aria-label="Convert to table"]')!;
    expect(button.getAttribute('title')).toBe('Convert to table');
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(editor.getJSON().blocks.map((b) => b.content.map((c) => c.text).join(''))).toEqual(['Name', 'Price', 'Tea', '3', '']);
    expect(editor.isInTable()).toBe(true);
    bubbleMenu.destroy();
    editor.destroy();
  });

  it('creates slash menu with standard command items', () => {
    const editor = new LevitEditor({ element: container });
    const slashMenu = createSlashMenu(editor);

    expect(slashMenu.element.classList.contains('levit-slash-menu')).toBe(true);
    const items = slashMenu.getItems();
    expect(items.some((item) => item.id === 'heading-1')).toBe(true);
    expect(items.some((item) => item.id === 'code-block')).toBe(true);

    slashMenu.destroy();
    editor.destroy();
  });

  it('the To-do list item turns the current block into an unchecked task', () => {
    const editor = new LevitEditor({ element: container });
    const slashMenu = createSlashMenu(editor);
    const item = slashMenu.getItems().find((i) => i.id === 'task-list');
    expect(item).toBeDefined();
    item!.action(editor);
    expect(editor.state.doc.blocks[0].type).toBe('task_list_item');
    expect(editor.state.doc.blocks[0].attrs).toEqual({ checked: false });
    slashMenu.destroy();
    editor.destroy();
  });
});
