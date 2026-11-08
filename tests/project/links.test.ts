import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const REPO = 'https://github.com/azusawa/levit';
const corePackage = () => JSON.parse(read('packages/levit/package.json'));

describe('project links', () => {
  it.each(['index.html', 'README.md', 'llms.txt', 'packages/levit/package.json'])(
    '%s does not point at the old repository owner',
    (file) => {
      expect(read(file)).not.toContain('github.com/yon/');
      expect(read(file)).not.toContain('githubusercontent.com/yon/');
    }
  );

  it('demo GitHub button points at the real repository', () => {
    expect(read('index.html')).toContain(`href="${REPO}"`);
  });

  it('package.json declares the repository', () => {
    const pkg = corePackage();
    expect(pkg.repository?.url).toBe(`git+${REPO}.git`);
    expect(pkg.homepage).toBe(`${REPO}#readme`);
    expect(pkg.bugs?.url).toBe(`${REPO}/issues`);
  });

  it('package.json names the author', () => {
    expect(corePackage().author).toBe('yonailab');
  });

  it('package is published as the public scoped name @yonailab/levit', () => {
    const pkg = corePackage();
    expect(pkg.name).toBe('@yonailab/levit');
    expect(pkg.publishConfig?.access).toBe('public');
  });

  it.each(['README.md', 'llms.txt'])('%s uses the scoped package name in examples', (file) => {
    const text = read(file);
    // npm rejected the bare name "levit", so no example may use it.
    expect(text).not.toMatch(/from 'levit[/']|import 'levit\/|npm install levit\b|unpkg\.com\/levit\//);
    expect(text).toContain("from '@yonailab/levit'");
    expect(text).toContain('unpkg.com/@yonailab/levit/dist/index.js');
  });

  it('README shows the scoped install command', () => {
    expect(read('README.md')).toContain('npm install @yonailab/levit');
  });

  it('README makes no copyright claims', () => {
    expect(read('README.md')).not.toMatch(/저작권|Clean[ -]?(IP|room)|법적/i);
  });

  it('README still points at the license file', () => {
    expect(read('README.md')).toContain('[MIT License](LICENSE)');
  });

  it.each(['LICENSE', 'packages/levit/src/index.ts'])('%s names yonailab as the copyright holder', (file) => {
    expect(read(file)).toMatch(/Copyright \(c\) 2026 yonailab\b/);
    expect(read(file)).not.toContain('Levit Authors');
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
