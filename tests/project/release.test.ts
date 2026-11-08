import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const PACKAGES = ['levit', 'react', 'vue'];

/** A copy of the package manifests, so the test does not touch the real ones. */
function copyOfRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'levit-release-'));
  cpSync(join(root, 'package.json'), join(dir, 'package.json'));
  for (const name of PACKAGES) {
    cpSync(join(root, 'packages', name, 'package.json'), join(dir, 'packages', name, 'package.json'));
  }
  return dir;
}

const manifest = (dir: string, name: string) =>
  JSON.parse(readFileSync(join(dir, 'packages', name, 'package.json'), 'utf8'));

describe('scripts/set-version.mjs', () => {
  it('sets one version on every package and points the wrappers at that core', () => {
    const dir = copyOfRepo();
    execFileSync('node', [join(root, 'scripts/set-version.mjs'), '1.2.3'], { cwd: dir });
    for (const name of PACKAGES) expect(manifest(dir, name).version).toBe('1.2.3');
    for (const name of ['react', 'vue']) {
      expect(manifest(dir, name).peerDependencies['@yonailab/levit']).toBe('^1.2.3');
    }
  });

  it('refuses something that is not a version', () => {
    const dir = copyOfRepo();
    expect(() => execFileSync('node', [join(root, 'scripts/set-version.mjs'), 'next'], { cwd: dir, stdio: 'pipe' })).toThrow();
    expect(manifest(dir, 'levit').version).not.toBe('next');
  });
});

describe('packages', () => {
  it('all have the same version, and the wrappers ask for that core', () => {
    const versions = PACKAGES.map((name) => manifest(root, name).version);
    expect(new Set(versions).size).toBe(1);
    for (const name of ['react', 'vue']) {
      expect(manifest(root, name).peerDependencies['@yonailab/levit']).toBe(`^${versions[0]}`);
    }
  });
});

describe('scripts/check-release-tag.mjs', () => {
  const check = (dir: string, tag: string) =>
    execFileSync('node', [join(root, 'scripts/check-release-tag.mjs'), tag], { cwd: dir, stdio: 'pipe' }).toString();

  it('passes when the tag is v + the version of every package', () => {
    const dir = copyOfRepo();
    execFileSync('node', [join(root, 'scripts/set-version.mjs'), '2.0.0'], { cwd: dir });
    expect(check(dir, 'v2.0.0')).toContain('2.0.0');
  });

  it('fails when the tag and the versions differ', () => {
    const dir = copyOfRepo();
    execFileSync('node', [join(root, 'scripts/set-version.mjs'), '2.0.0'], { cwd: dir });
    expect(() => check(dir, 'v2.0.1')).toThrow();
    expect(() => check(dir, '2.0.0')).toThrow();
  });
});
