import { describe, it, expect } from 'vitest';
import { PAGES, LANGS, pagePath, renderPage } from '../../site/lib/pages';
import { strings } from '../../site/lib/strings';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('the landing page leads with what writing and developing with Levit feel like, in every language', () => {
    const want = {
      en: { h1: 'Easy to write. Light to develop.', title: 'Levit — rich text editor, easy to write and light to develop', deps: '0 runtime dependencies' },
      ko: { h1: '쓰기는 편하게, 개발은 가볍게', title: 'Levit — 쓰기 편하고 개발은 가벼운 리치 텍스트 에디터', deps: '런타임 의존성 0개' },
      ja: { h1: '書くのは心地よく、開発は軽く。', title: 'Levit — 書き心地がよく、開発は軽いリッチテキストエディター', deps: 'ランタイム依存0個' },
    };
    for (const lang of LANGS) {
      const { html } = doc(lang, 'landing');
      expect(/<h1[^>]*>([^<]*)<\/h1>/.exec(html)?.[1], lang).toBe(want[lang].h1);
      expect(html, lang).toContain(`<title>${want[lang].title}</title>`);
      // The size and the dependency count stay as proof under the headline.
      expect(strings[lang].hero.lead, lang).toMatch(/30 kB/);
      expect(strings[lang].meta.landingDescription, lang).toContain(want[lang].deps);
    }
  });

  it('claims only what the core does: other packages, like yjs for collaboration, are installed by you', () => {
    for (const lang of LANGS) {
      const text = JSON.stringify(strings[lang]);
      for (const overclaim of ['the only thing you install', 'no version clashes', 'installs nothing else', '설치하는 것은 Levit 하나뿐', '버전 충돌도 없음', '함께 설치되는 패키지가 없습니다', 'インストールするのはLevitだけ', 'バージョン衝突もなし']) {
        expect(text, `${lang}: ${overclaim}`).not.toContain(overclaim);
      }
    }
  });

  it('the link preview image and the web manifest carry the same line as the English headline', () => {
    const line = strings.en.hero.title;
    expect(readFileSync(resolve(__dirname, '../../scripts/brand-images.mjs'), 'utf8')).toContain(`>${line}</p>`);
    expect(JSON.parse(readFileSync(resolve(__dirname, '../../site/public/manifest.webmanifest'), 'utf8')).description).toBe(line);
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

  it.each(PAGES)('$lang $kind: icons and a link preview image', ({ lang, kind }) => {
    const { html } = doc(lang, kind);
    expect(html).toContain('<link rel="icon" href="/levit/favicon.ico" sizes="32x32">');
    expect(html).toContain('<link rel="manifest" href="/levit/manifest.webmanifest">');
    expect(html).toContain('<meta name="theme-color" content="#f7f7f6">');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/levit/favicon.svg">');
    expect(html).toContain('<link rel="apple-touch-icon" href="/levit/apple-touch-icon.png">');
    expect(html).toContain('<meta property="og:image" content="https://azusawa.github.io/levit/og-image.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('the header and footer draw the logo from the brand files, so they never drift apart', () => {
    const { html } = doc('en', 'landing');
    const inner = (file: string) =>
      readFileSync(resolve(__dirname, '../../brand', file), 'utf8')
        .replace(/^<svg[^>]*>|<\/svg>\s*$/g, '')
        .replaceAll('#0b0b0c', 'currentColor');
    expect(html).toContain(inner('levit-mark.svg'));
    expect(html.split(inner('levit-wordmark.svg')).length - 1).toBe(2);
  });

  it('the header shows the new mark, with the selected block in the brand pink', () => {
    const { html } = doc('en', 'landing');
    const header = html.slice(html.indexOf('<header class="site-header">'), html.indexOf('</header>'));
    expect(header).toContain('#ff3d7f');
    expect(header).toContain('aria-label="Levit home"');
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
