import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createSlashMenu } from '../../src/plugins/slash-menu';

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
});

