import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');

describe('README is for users', () => {
  it('has no developer test section or release steps', () => {
    const readme = read('README.md');
    expect(readme).not.toMatch(/^## .*테스트/m);
    expect(readme).not.toMatch(/배포 절차|npm publish|npm version/);
  });

  it('still says it is tested and links to the contributing guide', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/테스트/);
    expect(readme).toContain('[CONTRIBUTING.md](CONTRIBUTING.md)');
  });

  it('keeps the ESM-only note in the install section', () => {
    const readme = read('README.md');
    const install = readme.slice(readme.indexOf('### 1. 설치'), readme.indexOf('### 2.'));
    expect(install).toContain('ESM 전용');
  });
});

describe('CONTRIBUTING.md', () => {
  it('exists and covers TDD, the checks and the release steps', () => {
    expect(existsSync(resolve(root, 'CONTRIBUTING.md'))).toBe(true);
    const guide = read('CONTRIBUTING.md');
    for (const text of [
      'TDD',
      'npm test',
      'npm run test:e2e',
      'npm run typecheck',
      'npm run build',
      'npm run check:package',
      'npm version',
      'npm publish',
      'git push --follow-tags',
      'gh release create',
    ]) {
      expect(guide).toContain(text);
    }
  });
});
