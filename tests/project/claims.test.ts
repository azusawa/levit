import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strings } from '../../site/lib/strings';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const LANGS = ['en', 'ko', 'ja'] as const;

// Levit is "easy and light", said in words. A size, a speed or a count goes
// stale with the next change, so the copy gives none, and it does not sell
// "zero dependencies" either.
const numbers = [
  /\d+(?:\.\d+)?\s*(?:kB|KB|kb|KiB|MB)\b/,
  /\d+(?:\.\d+)?\s*ms\b/,
  /\d{1,3},\d{3}|\d+\s*万|\d+\s*만\s*개/,
  /단\s*\d+\s*줄/,
];
const dependencies = [
  /zero[- ]?(?:runtime[- ])?dependenc/i,
  /\b0 (?:runtime )?dependenc/i,
  /no (?:runtime |other )?(?:dependencies|packages)/i,
  /has no dependencies/i,
  /의존성\s*0|의존성 없이|의존성이 없|딸려 오는/,
  /依存\s*0|依存ゼロ|依存がない|依存もない|付いてくる/,
];

const texts: [string, string][] = [
  ['README.md', read('README.md')],
  ['llms.txt', read('llms.txt')],
  ...LANGS.flatMap((lang) => ['docs', 'guide'].map((page): [string, string] => [`site/content/${lang}/${page}.md`, read(`site/content/${lang}/${page}.md`)])),
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

  it('say Levit is easy and light, at the top of the README and the landing page', () => {
    const head = read('README.md').slice(0, 800);
    expect(head).toMatch(/쉽/);
    expect(head).toMatch(/가볍|가벼/);
    const light = { en: /light/i, ko: /가볍|가벼/, ja: /軽/ };
    for (const lang of LANGS) {
      expect(strings[lang].hero.lead, lang).toMatch(light[lang]);
      expect(strings[lang].meta.landingDescription, lang).toMatch(light[lang]);
    }
  });
});
