import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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
