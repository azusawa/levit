import { describe, it, expect, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { createBubbleMenu } from '../../src/plugins/bubble-menu';
import { createTableToolbar } from '../../src/plugins/table-toolbar';
import { createBlock, createTextNode } from '../../src/core/model/document';
import '../../src/ui/web-component';

let cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.forEach((f) => f());
  cleanup = [];
});

function make(options: Partial<ConstructorParameters<typeof LevitEditor>[0]> = {}) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new LevitEditor({
    element,
    initialContent: { version: 1, blocks: [createBlock('table_cell', { table: 't', row: 'r' }, [createTextNode('A')], 'a')] },
    ...options,
  });
  const bubble = createBubbleMenu(editor);
  const table = createTableToolbar(editor);
  cleanup.push(() => {
    bubble.destroy();
    table.destroy();
    editor.destroy();
    element.remove();
  });
  return { editor, bubble, table };
}

const labels = (root: Element, group: string) =>
  Array.from(root.querySelectorAll(`[aria-label="${group}"] button`), (b) => b.getAttribute('aria-label'));

describe('choosing the colors of the palettes', () => {
  it('has the nine built-in colors and a color picker by default', () => {
    const { editor, bubble } = make();
    expect(editor.colors.map((c) => c.name)).toEqual(['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']);
    expect(editor.colorPicker).toBe(true);
    expect(bubble.element.querySelectorAll('input[type="color"]').length).toBe(2);
  });

  it('shows the colors the app chooses, its own ones too', () => {
    const { bubble, table } = make({ colors: ['red', 'blue', { name: 'brand', label: 'Brand' }] });
    expect(labels(bubble.element, 'Text color')).toEqual(['Default', 'Red', 'Blue', 'Brand']);
    expect(labels(bubble.element, 'Highlight color')).toEqual(['No highlight', 'Red', 'Blue', 'Brand']);
    expect(labels(table.element, 'Cell color')).toEqual(['No color', 'Red', 'Blue', 'Brand']);
    const brand = bubble.element.querySelector('[aria-label="Text color"] button[aria-label="Brand"]') as HTMLElement;
    expect(brand.style.color).toBe('var(--levit-color-brand)');
  });

  it('leaves out names that are not color names', () => {
    const { editor } = make({ colors: ['red', 'Bad Name', { name: 'x;y', label: 'X' }, 'red'] });
    expect(editor.colors.map((c) => c.name)).toEqual(['red']);
  });

  it('can leave out the color picker', () => {
    const { bubble, table } = make({ colorPicker: false });
    expect(bubble.element.querySelector('input[type="color"]')).toBeNull();
    expect(table.element.querySelector('input[type="color"]')).toBeNull();
  });
});

describe('<levit-editor color-picker="false">', () => {
  it('leaves out the color picker, also when set later', async () => {
    const el = document.createElement('levit-editor');
    el.setAttribute('color-picker', 'false');
    document.body.appendChild(el);
    cleanup.push(() => el.remove());
    expect(document.querySelector('.levit-bubble-menu input[type="color"]')).toBeNull();
    el.setAttribute('color-picker', 'true');
    expect(document.querySelector('.levit-bubble-menu input[type="color"]')).not.toBeNull();
  });
});
