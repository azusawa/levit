import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import ts from 'typescript';
import { strings } from '../../site/lib/strings';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const kB = (code: string) => gzipSync(code, { level: 9 }).length / 1000;

/** A file and every file it imports, relatively, as one string. */
function withImports(file: string, seen = new Set<string>()): string {
  if (seen.has(file)) return '';
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  const imports = Array.from(code.matchAll(/from\s*["'](\.[^"']+)["']/g), (m) => resolve(dirname(file), m[1]));
  return code + imports.map((f) => withImports(f, seen)).join('');
}

let out: string;
const size = { core: 0, ai: 0, yjs: 0 };

beforeAll(async () => {
  // Built the way it is published, into a folder of its own.
  out = mkdtempSync(join(tmpdir(), 'levit-size-'));
  await build({
    root: resolve(root, 'packages/levit'),
    configFile: resolve(root, 'packages/levit/vite.config.ts'),
    logLevel: 'silent',
    build: { outDir: out, emptyOutDir: true, sourcemap: false },
  });
  // What importing the core loads, and what the AI entry point adds to it.
  size.core = kB(withImports(join(out, 'index.js')));
  size.ai = kB(readFileSync(join(out, 'ai.js'), 'utf8'));
  // The Yjs binding is published as tsc writes it.
  const { config } = ts.readConfigFile(resolve(root, 'packages/yjs/tsconfig.json'), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, resolve(root, 'packages/yjs'));
  size.yjs = kB(ts.transpileModule(read('packages/yjs/src/index.ts'), { compilerOptions: options }).outputText);
}, 60_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

/** The sizes a text gives, like "30 kB" or "7.5 kB". */
const claimed = (text: string) => Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*kB/g), (m) => Number(m[1]));
/** A size is right when it is within 10% (and at least 1 kB) of what was measured. */
const near = (n: number, measured: number) => Math.abs(n - measured) <= Math.max(1, measured * 0.1);

const texts: [string, string][] = [
  ['README.md', read('README.md')],
  ...(['en', 'ko', 'ja'] as const).map((lang): [string, string] => [`site/content/${lang}/docs.md`, read(`site/content/${lang}/docs.md`)]),
  ...(['en', 'ko', 'ja'] as const).map((lang): [string, string] => [`site strings ${lang}`, JSON.stringify(strings[lang])]),
];

describe('the sizes the docs and the site give', () => {
  it('are the sizes of the packages as built', () => {
    for (const [where, text] of texts) {
      for (const n of claimed(text)) {
        expect(
          Object.values(size).some((measured) => near(n, measured)),
          `${where} says ${n} kB; measured core ${size.core}, AI ${size.ai}, Yjs ${size.yjs} kB`
        ).toBe(true);
      }
    }
  });

  it('the landing page and the README give the size of the core', () => {
    for (const lang of ['en', 'ko', 'ja'] as const) {
      expect(claimed(strings[lang].hero.lead).some((n) => near(n, size.core)), lang).toBe(true);
    }
    expect(claimed(read('README.md')).some((n) => near(n, size.core))).toBe(true);
  });
});
