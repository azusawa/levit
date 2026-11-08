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
