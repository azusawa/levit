import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { strings } from '../../site/lib/strings';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const LANGS = ['en', 'ko', 'ja'] as const;

// Levit is "easy and light", said in words. A size, a speed or a count goes
// stale with the next change, so the copy gives none, and it does not sell
// "zero dependencies" either.
const numbers = [
  /\d+(?:\.\d+)?\s*(?:kB|KB|kb|KiB|MB)\b/,
  // A speed: "about 5 ms", "약 5 ms", "約5 ms". A timing option like "500 ms" is a fact to use, not a claim.
  /(?:about|around|약|約)\s*\d+(?:\.\d+)?\s*ms\b/i,
  // A count of blocks: "20,000 blocks", "블록 2만 개", "2万ブロック".
  /\d{1,3}(?:,\d{3})+[- ]?blocks?|블록\s*\d+\s*만|\d+\s*만\s*개|\d+\s*万\s*ブロック/i,
  /단\s*\d+\s*줄|just \d+ lines|\d+\s*行だけ/i,
];
const dependencies = [
  /zero[- ]?(?:runtime[- ])?dependenc/i,
  /dependency[- ]free/i,
  /\b0 (?:runtime |external )?dependenc/i,
  /(?:no|without) (?:runtime |external )?dependencies/i,
  /의존성\s*0|의존성 없이|의존성이 (?:전혀 )?없/,
  /依存\s*0|依存ゼロ|依存がない|依存もない|依存なし/,
];

/** Text with code left out: code blocks and inline code give values, not claims. */
const prose = (text: string) => text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

// Every document in the repository, the npm descriptions and keywords, and the site's copy.
const files = execSync('git ls-files "*.md" "*.txt" "*.html"', { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !f.startsWith('e2e/'));
const manifests = execSync('git ls-files "packages/*/package.json"', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const texts: [string, string][] = [
  ...files.map((f): [string, string] => [f, prose(read(f))]),
  ...manifests.map((f): [string, string] => {
    const { description, keywords } = JSON.parse(read(f));
    return [f, [description, ...(keywords ?? [])].join(' · ')];
  }),
  ['packages/levit/src/index.ts header', read('packages/levit/src/index.ts').split('*/')[0]],
  ...LANGS.map((lang): [string, string] => [`site strings ${lang}`, JSON.stringify(strings[lang])]),
  ['site/src/samples.ts', read('site/src/samples.ts')],
  ['site/src/fake-ai.ts', read('site/src/fake-ai.ts')],
];

describe('what the docs and the site say about Levit', () => {
  it('give no sizes, speeds or counts that go stale', () => {
    for (const [where, text] of texts) {
      for (const pattern of numbers) expect(text.match(pattern)?.[0], `${where} ${pattern}`).toBeUndefined();
    }
  });

  it('do not sell zero dependencies', () => {
    for (const [where, text] of texts) {
      for (const pattern of dependencies) expect(text.match(pattern)?.[0], `${where} ${pattern}`).toBeUndefined();
    }
  });

  it('the patterns catch the claims, and leave timing options and other text alone', () => {
    const caught = (t: string) => [...numbers, ...dependencies].some((p) => p.test(t));
    for (const t of ['45 kB', 'about 5 ms', '20,000 blocks', '블록 2만 개', '단 3줄', 'dependency-free', 'without dependencies', '依存なし', 'Zero-Dependency']) expect(caught(t), t).toBe(true);
    for (const t of ['captureTimeout 500 ms', 'no packages need updating', 'Chrome 87', '1,000 users', 'yjs is a peer dependency']) expect(caught(t), t).toBe(false);
  });

  it('say Levit is easy and light, at the top of the README and the landing page', () => {
    const tagline = /<i>([^<]*)<\/i>/.exec(read('README.md'))?.[1];
    expect(tagline).toMatch(/쉽/);
    expect(tagline).toMatch(/가볍|가벼/);
    const light = { en: /light/i, ko: /가볍|가벼/, ja: /軽/ };
    for (const lang of LANGS) {
      expect(strings[lang].hero.lead, lang).toMatch(light[lang]);
      expect(strings[lang].meta.landingDescription, lang).toMatch(light[lang]);
    }
  });
});
