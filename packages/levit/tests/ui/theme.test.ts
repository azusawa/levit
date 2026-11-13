import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(__dirname, '../../src/ui/theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The variables set in the first block that matches a selector. */
function variablesIn(selector: RegExp): Map<string, string> {
  const block = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(css);
  expect(block, String(selector)).not.toBeNull();
  return new Map(Array.from(block![1].matchAll(/(--levit-[\w-]+)\s*:\s*([^;]+);/g), (m) => [m[1], m[2].trim()]));
}

const light = variablesIn(/:root/);
const dark = variablesIn(/\[data-theme="dark"\]/);
const autoDark = variablesIn(/:root:not\(\[data-theme="light"\]\)/);

describe('theme variables', () => {
  it('every variable used is defined in :root', () => {
    const used = new Set(Array.from(css.matchAll(/var\((--levit-[\w-]+)/g), (m) => m[1]));
    for (const name of used) expect(light.has(name), name).toBe(true);
  });

  it('dark mode sets every color that light mode sets, both ways of turning it on', () => {
    const colors = Array.from(light.keys()).filter((name) => /^(#|rgb|hsl)/.test(light.get(name)!));
    for (const name of colors) {
      expect(dark.has(name), `[data-theme="dark"] ${name}`).toBe(true);
      expect(autoDark.has(name), `prefers-color-scheme ${name}`).toBe(true);
    }
  });

  it('colors are only written in variables, so a theme can change all of them', () => {
    const rules = css
      .replace(/:root\s*\{[^}]*\}/, '')
      .replace(/\[data-theme="dark"\]\s*\{[^}]*\}/, '')
      .replace(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{[^}]*\}\s*\}/, '');
    const hardcoded = rules.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? [];
    expect(hardcoded).toEqual([]);
  });
});

describe('tables', () => {
  it('draws cell borders, header cells and lets a wide table scroll', () => {
    expect(css).toMatch(/\.levit-table\s*\{[^}]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.levit-block-table_cell\s*\{[^}]*border:[^;]*var\(--levit-border\)/);
    expect(css).toMatch(/th\.levit-block-table_cell\s*\{[^}]*background[^;]*var\(--levit-surface\)/);
  });
});

describe('table toolbar', () => {
  it('floats over the page in the menu colors', () => {
    expect(css).toMatch(/\.levit-table-toolbar\s*\{[^}]*position:\s*absolute[^}]*background-color:\s*var\(--levit-surface\)/);
  });

  it('draws its icons in the text color and marks the header button when on', () => {
    expect(css).toMatch(/\.levit-table-toolbar-btn svg\s*\{[^}]*stroke:\s*currentColor/);
    expect(css).toMatch(/\.levit-table-toolbar-btn\[aria-pressed="true"\]\s*\{[^}]*var\(--levit-primary\)/);
  });

  it('shows which button has keyboard focus', () => {
    expect(css).toMatch(/\.levit-table-toolbar-btn:focus-visible\s*\{[^}]*outline:[^;]*var\(--levit-primary\)/);
  });
});

describe('table size grid', () => {
  it('floats like the menus', () => {
    expect(css).toMatch(/\.levit-table-picker\s*\{[^}]*position:\s*absolute[^}]*background-color:\s*var\(--levit-surface\)/);
  });

  it('lays the cells out in the columns of the grid and fills the chosen ones', () => {
    expect(css).toMatch(/\.levit-table-picker-grid\s*\{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.levit-table-picker-cell\.is-on\s*\{[^}]*var\(--levit-primary\)/);
  });
});

describe('table toolbar room', () => {
  const px = (re: RegExp) => Number(re.exec(css)![1]);

  it('tables in an editable editor with the toolbar keep room above for it, set by a variable', () => {
    expect(css).toMatch(/:where\(\.levit-has-table-toolbar\[contenteditable="true"\]\)\s+\.levit-table\s*\{[^}]*margin-top:\s*var\(--levit-table-toolbar-room\)/);
  });

  it('the room fits the toolbar and the 6px gap under it', () => {
    const button = px(/\.levit-table-toolbar-btn\s*\{[^}]*height:\s*(\d+)px/);
    const padding = px(/\.levit-table-toolbar\s*\{[^}]*padding:\s*(\d+)px/);
    const border = px(/\.levit-table-toolbar\s*\{[^}]*border:\s*(\d+)px/);
    const room = parseFloat(light.get('--levit-table-toolbar-room')!);
    expect(room).toBeGreaterThanOrEqual(button + 2 * padding + 2 * border + 6);
  });
});
