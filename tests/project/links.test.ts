import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const REPO = 'https://github.com/azusawa/levit';

describe('project links', () => {
  it.each(['index.html', 'README.md', 'llms.txt', 'package.json'])(
    '%s does not point at the old repository owner',
    (file) => {
      expect(read(file)).not.toMatch(/github(usercontent)?\.com\/yon\//);
    }
  );

  it('demo GitHub button points at the real repository', () => {
    expect(read('index.html')).toContain(`href="${REPO}"`);
  });

  it('package.json declares the repository', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.repository?.url).toBe(`git+${REPO}.git`);
    expect(pkg.homepage).toBe(`${REPO}#readme`);
    expect(pkg.bugs?.url).toBe(`${REPO}/issues`);
  });

  it('package.json names the author', () => {
    expect(JSON.parse(read('package.json')).author).toBe('azusawa');
  });

  it('demo page declares a favicon that exists', () => {
    const match = read('index.html').match(/<link rel="icon"[^>]*href="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(existsSync(resolve(root, match![1]))).toBe(true);
  });

  it('README logo is a file in the repository', () => {
    const match = read('README.md').match(/<img src="([^"]+)" alt="Levit Logo"/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toMatch(/^https?:/);
    expect(existsSync(resolve(root, match![1]))).toBe(true);
  });
});
