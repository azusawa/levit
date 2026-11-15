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
  // Static, side-effect and dynamic imports: import x from "./a", import "./b", import("./c").
  const imports = Array.from(code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["'](\.[^"']+)["']/g), (m) => resolve(dirname(file), m[1]));
  return code + imports.map((f) => withImports(f, seen)).join('');
}

let out: string;
type Kind = 'core' | 'ai' | 'yjs' | 'css';
const size: Record<Kind, number> = { core: 0, ai: 0, yjs: 0, css: 0 };

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
  size.css = kB(readFileSync(join(out, 'levit.css'), 'utf8'));
  // The Yjs binding is published as tsc writes it.
  const { config } = ts.readConfigFile(resolve(root, 'packages/yjs/tsconfig.json'), ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(config, ts.sys, resolve(root, 'packages/yjs'));
  size.yjs = kB(ts.transpileModule(read('packages/yjs/src/index.ts'), { compilerOptions: options }).outputText);
}, 60_000);

afterAll(() => rmSync(out, { recursive: true, force: true }));

/**
 * The sizes a text gives, like "30 kB" or "7.5 KB", each with what it is the
 * size of: the package named in the same phrase, or the core.
 */
function claims(text: string): { n: number; kind: Kind }[] {
  return Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(?:kB|KB|kb|KiB)\b/g), (m) => {
    // The words of the same phrase: back to the last separator, like "·" or ",".
    const before = text.slice(0, m.index).split(/·|[,;:.]\s|[、，。：]/).pop()!;
    const named = Array.from(before.matchAll(/\b(AI|Yjs|CSS)\b/g)).pop()?.[1];
    return { n: Number(m[1]), kind: named === 'AI' ? 'ai' : named === 'Yjs' ? 'yjs' : named === 'CSS' ? 'css' : 'core' };
  });
}
/** A size is right when it is within 1 kB of what was measured. */
const near = (n: number, measured: number) => Math.abs(n - measured) <= 1;
const wrong = (text: string) => claims(text).filter(({ n, kind }) => !near(n, size[kind]));

const docs = ['README.md', 'llms.txt', ...(['en', 'ko', 'ja'] as const).flatMap((lang) => [`site/content/${lang}/docs.md`, `site/content/${lang}/guide.md`])];
const texts: [string, string][] = [
  ...docs.map((file): [string, string] => [file, read(file)]),
  ...(['en', 'ko', 'ja'] as const).map((lang): [string, string] => [`site strings ${lang}`, JSON.stringify(strings[lang])]),
];

describe('the sizes the docs and the site give', () => {
  it('are the sizes of the packages they name, as built', () => {
    for (const [where, text] of texts) {
      expect(wrong(text), `${where}; measured ${JSON.stringify(size)} kB`).toEqual([]);
    }
  });

  it('catches a size given for the wrong package', () => {
    const swapped = `AI ${Math.round(size.yjs + 4)} kB · Yjs binding ${Math.round(size.ai + 4)} kB`;
    expect(wrong(swapped).map((c) => c.kind)).toEqual(['ai', 'yjs']);
  });

  it('the landing page and the README give the size of the core, and the README that of the CSS', () => {
    for (const lang of ['en', 'ko', 'ja'] as const) {
      expect(claims(strings[lang].hero.lead).some(({ n, kind }) => kind === 'core' && near(n, size.core)), lang).toBe(true);
    }
    const readme = claims(read('README.md'));
    expect(readme.some(({ n, kind }) => kind === 'core' && near(n, size.core))).toBe(true);
    expect(readme.some(({ n, kind }) => kind === 'css' && near(n, size.css))).toBe(true);
  });
});
