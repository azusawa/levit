import { describe, it, expect } from 'vitest';
import { PAGES, LANGS, pagePath, renderPage } from '../../site/lib/pages';
import { strings } from '../../site/lib/strings';

const doc = (lang: string, kind: string) => {
  const html = renderPage(lang as any, kind as any, { base: '/levit/' });
  return { html, count: (re: RegExp) => (html.match(re) ?? []).length };
};

describe('site pages', () => {
  it('has a landing page, a user guide and developer docs in English, Korean and Japanese', () => {
    expect(LANGS).toEqual(['en', 'ko', 'ja']);
    expect(PAGES.map((p) => pagePath(p.lang, p.kind))).toEqual([
      '', 'guide/', 'docs/', 'ko/', 'ko/guide/', 'ko/docs/', 'ja/', 'ja/guide/', 'ja/docs/',
    ]);
  });

  it.each(PAGES)('$lang $kind: the right language, one h1, a title and a description', ({ lang, kind }) => {
    const { html, count } = doc(lang, kind);
    expect(html).toMatch(new RegExp(`<html lang="${lang}"`));
    expect(count(/<h1[\s>]/g)).toBe(1);
    expect(html).toMatch(/<title>[^<]+Levit|<title>Levit[^<]*/);
    expect(html).toMatch(/<meta name="description" content="[^"]{40,}"/);
  });

  it.each(PAGES)('$lang $kind: links to the same page in the other languages', ({ lang, kind }) => {
    const { html } = doc(lang, kind);
    for (const other of LANGS) {
      expect(html).toContain(`<link rel="alternate" hreflang="${other}" href="https://azusawa.github.io/levit/${pagePath(other, kind)}">`);
      expect(html).toContain(`href="/levit/${pagePath(other, kind)}"`);
    }
    expect(html).toContain(`hreflang="x-default" href="https://azusawa.github.io/levit/${pagePath('en', kind)}"`);
  });

  it.each(PAGES)('$lang $kind: the navigation leads to the guide and docs in the same language', ({ lang, kind }) => {
    const { html } = doc(lang, kind);
    expect(html).toContain(`href="/levit/${pagePath(lang, 'guide')}"`);
    expect(html).toContain(`href="/levit/${pagePath(lang, 'docs')}"`);
    expect(html).toContain('href="https://github.com/azusawa/levit"');
  });

  it('the landing page holds the playground with its four parts, labelled in the page language', () => {
    for (const lang of LANGS) {
      const { html } = doc(lang, 'landing');
      expect(html).toContain('id="playground"');
      for (const tab of ['write', 'ai', 'together', 'comments']) expect(html).toContain(`data-tab="${tab}"`);
      expect(html).toContain(strings[lang].playground.tabs.together);
      expect(html).toContain('npm install @yonailab/levit');
    }
  });

  it('the guide and docs pages show their Markdown with a table of contents', () => {
    const { html } = doc('ko', 'docs');
    expect(html).toMatch(/<nav[^>]+class="toc"/);
    expect(html).toMatch(/<h2 id="[^"]+">/);
  });

  it('can be built for another address, with links and canonical URLs to match', () => {
    const html = renderPage('ko', 'guide', { base: '/', siteUrl: 'https://levit.example/' });
    expect(html).toContain('<link rel="canonical" href="https://levit.example/ko/guide/">');
    expect(html).toContain('hreflang="ja" href="https://levit.example/ja/guide/"');
    expect(html).toContain('href="/ko/docs/"');
    expect(html).not.toContain('azusawa.github.io');
  });

  it('every language has every string English has', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    for (const lang of LANGS) expect(keys(strings[lang]).sort()).toEqual(keys(strings.en).sort());
  });
});
