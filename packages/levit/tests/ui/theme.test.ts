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
  it('floats over the page in the menu colors, like the image toolbar', () => {
    expect(css).toMatch(/\.levit-table-toolbar,\s*\.levit-image-toolbar\s*\{[^}]*position:\s*absolute[^}]*background-color:\s*var\(--levit-surface\)/);
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
    const padding = px(/\.levit-image-toolbar\s*\{[^}]*padding:\s*(\d+)px/);
    const border = px(/\.levit-image-toolbar\s*\{[^}]*border:\s*(\d+)px/);
    const room = parseFloat(light.get('--levit-table-toolbar-room')!);
    expect(room).toBeGreaterThanOrEqual(button + 2 * padding + 2 * border + 6);
  });
});

describe('table add buttons', () => {
  it('are thin bars that float like the toolbar', () => {
    expect(css).toMatch(/\.levit-table-add-row,\s*\.levit-table-add-column\s*\{[^}]*position:\s*absolute/);
    expect(css).toMatch(/\.levit-table-add-row\s*\{[^}]*height:\s*14px/);
    expect(css).toMatch(/\.levit-table-add-column\s*\{[^}]*width:\s*14px/);
  });

  it('tables keep room below for the row button, the last table too, and right for the column button', () => {
    expect(css).toMatch(/:where\(\.levit-has-table-toolbar\[contenteditable="true"\]\)\s+\.levit-table\s*\{[^}]*margin-bottom:\s*16px/);
    expect(css).toMatch(/:where\(\.levit-has-table-toolbar\[contenteditable="true"\]\)\s+\.levit-table\s*\{[^}]*margin-right:\s*16px/);
    const last = css.indexOf('.levit-table:last-child');
    const lastRoom = css.search(/:where\(\.levit-has-table-toolbar\[contenteditable="true"\]\)\s+\.levit-table:last-child\s*\{[^}]*margin-bottom:\s*16px/);
    expect(lastRoom).toBeGreaterThan(last);
  });
});

describe('the stylesheet styles only Levit', () => {
  /** Every selector of every rule, with at-rules opened and keyframes left out. */
  const selectors = Array.from(
    css
      .replace(/@(?:-webkit-)?keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*\s*\}/g, '')
      .replace(/@font-face\s*\{[^}]*\}/g, '')
      .replace(/@[a-z-]+[^{;]*\{/g, '')
      .matchAll(/([^{}]+)\{[^}]*\}/g),
    (m) => m[1].split(',').map((s) => s.trim())
  ).flat();

  it('every rule is scoped to a Levit class, so links and bold text elsewhere on the page keep their look', () => {
    const theme = /^(:root|\[data-theme(="\w+")?\]|:root:not\(\[data-theme="\w+"\]\))$/;
    const scoped = /\.levit-[\w-]+|(^|[\s>+~])levit-editor\b/;
    expect(selectors.filter((s) => !theme.test(s) && !scoped.test(s))).toEqual([]);
  });

  it('the scoping test catches what is not scoped', () => {
    const theme = /^(:root|\[data-theme(="\w+")?\]|:root:not\(\[data-theme="\w+"\]\))$/;
    const scoped = /\.levit-[\w-]+|(^|[\s>+~])levit-editor\b/;
    for (const s of [':root a', '[data-theme] strong', 'a[href*=levit]', 'a']) expect(theme.test(s) || scoped.test(s), s).toBe(false);
  });

  it('leaves marks that bring their own class, like a plugin mention, to their own styles', () => {
    for (const tag of ['strong', 'em', 'u', 's', 'a', 'a:hover']) {
      const [el, state = ''] = tag.split(':');
      expect(selectors, tag).toContain(`.levit-editor-root ${el}:not([class])${state ? ':' + state : ''}`);
    }
  });
});

describe('the line color row of the palette', () => {
  it('draws the swatches with a thick line, and shows the hover with the background, as the line is the color', () => {
    expect(css).toMatch(/\.levit-color-row-border \.levit-color-swatch\s*\{[^}]*border-width:\s*3px/);
    expect(css).toMatch(/\.levit-color-row-border \.levit-color-swatch:hover\s*\{[^}]*background-color:\s*var\(--levit-border\)/);
  });

  it('draws image sizes and alignments, and the selected image with an outline and no caret', async () => {
    const { IMAGE_WIDTHS } = await import('../../src/core/model/image');
    for (const [size, width] of Object.entries(IMAGE_WIDTHS)) {
      expect(css).toMatch(new RegExp(`figure\\.levit-block-image\\[data-size="${size}"\\] img\\s*\\{[^}]*width:\\s*${width}`));
    }
    expect(css).toMatch(/figure\.levit-block-image\[data-align="center"\]\s*\{[^}]*text-align:\s*center/);
    expect(css).toMatch(/figure\.levit-block-image\[data-align="right"\]\s*\{[^}]*text-align:\s*right/);
    expect(css).toMatch(/figure\.levit-block-image\[data-selected\] img\s*\{[^}]*outline:\s*2px solid var\(--levit-primary\)/);
    expect(css).toMatch(/\.levit-editor-root\.levit-image-selected\s*\{[^}]*caret-color:\s*transparent/);
  });

  it('floats the image URL field like the menus, with the field and its button in a row', () => {
    expect(css).toMatch(/\.levit-image-url\s*\{[^}]*position:\s*absolute[^}]*background-color:\s*var\(--levit-surface\)/);
    expect(css).toMatch(/\.levit-image-url\s*\{[^}]*gap:/);
  });
});

describe('search panel', () => {
  it('floats over the page in the menu colors and hides when closed', () => {
    expect(css).toMatch(/\.levit-search\s*\{[^}]*position:\s*absolute[^}]*background-color:\s*var\(--levit-surface\)/);
    expect(css).toMatch(/\.levit-search\[hidden\],\s*\.levit-search-row\[hidden\],\s*\.levit-search-btn\[hidden\]\s*\{[^}]*display:\s*none/);
  });

  it('paints the matches, and the current one more strongly, in theme colors', () => {
    expect(css).toMatch(/\.levit-editor-root ::highlight\(levit-search\)\s*\{[^}]*background-color:\s*var\(--levit-search-match\)/);
    expect(css).toMatch(/\.levit-editor-root ::highlight\(levit-search-current\)\s*\{[^}]*background-color:\s*var\(--levit-search-current\)/);
    for (const theme of [light, dark, autoDark]) {
      expect(theme.has('--levit-search-match')).toBe(true);
      expect(theme.has('--levit-search-current')).toBe(true);
    }
  });

  it('marks the match case button when it is on, and shows keyboard focus', () => {
    expect(css).toMatch(/\.levit-search-btn\[aria-pressed="true"\]\s*\{[^}]*var\(--levit-primary\)/);
    expect(css).toMatch(/\.levit-search-btn:focus-visible[^{]*\{[^}]*outline/);
  });
});

describe('autocomplete popups and mentions', () => {
  it('the slash menu and the "@" and ":" popups look alike, float in the menu colors and use the editor font', () => {
    expect(css).toMatch(/\.levit-slash-menu,\s*\.levit-autocomplete-menu\s*\{[^}]*position:\s*absolute[^}]*background-color:\s*var\(--levit-surface\)/);
    expect(css).toMatch(/\.levit-slash-menu,\s*\.levit-autocomplete-menu\s*\{[^}]*font-family:\s*var\(--levit-font-sans\)/);
    expect(css).toMatch(/\.levit-autocomplete-item\.is-active,\s*\.levit-autocomplete-item:hover\s*\{[^}]*background-color/);
  });

  it('draws a mention in theme colors, light and dark', () => {
    expect(css).toMatch(/\.levit-mention\s*\{[^}]*background:\s*var\(--levit-mention-bg\)[^}]*color:\s*var\(--levit-mention-text\)/);
  });
});
