import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('build target', () => {
  // Vite changes its default target between major versions, which would
  // silently drop older browsers. The target is set in the config instead.
  const target = ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'];

  it('is set in the core build config', () => {
    const config = read('packages/levit/vite.config.ts');
    expect(config).toContain(`target: ${JSON.stringify(target).replaceAll('"', "'").replaceAll(',', ', ')}`);
  });

  it('README says which browsers are supported', () => {
    expect(read('README.md')).toContain('Chrome 87, Edge 88, Firefox 78, Safari 14 이상');
  });
});

describe('the core stays light', () => {
  /** Every source file the core entry point loads, relatively. */
  function loaded(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](\.[^"']+)["']/g)) {
      const base = resolve(file, '..', m[1]).replace(/\.js$/, '');
      const next = [`${base}.ts`, `${base}/index.ts`].find((f) => existsSync(f));
      if (next) loaded(next, seen);
    }
    return seen;
  }
  const core = loaded(resolve(root, 'packages/levit/src/index.ts'));
  const src = (f: string) => resolve(root, 'packages/levit/src', f);

  it('loads the AI entry point only when it is imported', () => {
    for (const f of ['ai/index.ts', 'ai/schema.ts', 'ai/commands.ts', 'ai/suggestions.ts', 'ai/stream-markdown.ts']) {
      expect(core.has(src(f)), f).toBe(false);
    }
  });

  it('does not bring Yjs or any other package with it', () => {
    for (const f of core) expect(readFileSync(f, 'utf8'), f).not.toMatch(/(?:\bfrom|\bimport)\s*\(?\s*["'][^."'/][^"']*["']/);
    expect(JSON.parse(read('packages/levit/package.json')).dependencies).toBeUndefined();
  });
});
