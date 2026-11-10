// Builds the HTML of every page of the site. The Vite config calls this for
// each page file; the pages' own scripts (site/src) bring the editors to life.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderDoc } from './render.ts';
import { strings, type Lang, type SiteStrings } from './strings.ts';
import { en as enMessages, ja as jaMessages, ko as koMessages } from '../../packages/levit/src/i18n/messages.ts';

export type Kind = 'landing' | 'guide' | 'docs';
export const LANGS: Lang[] = ['en', 'ko', 'ja'];
export const KINDS: Kind[] = ['landing', 'guide', 'docs'];
export const PAGES = LANGS.flatMap((lang) => KINDS.map((kind) => ({ lang, kind })));

export const SITE_URL = 'https://azusawa.github.io/levit/';
const REPO = 'https://github.com/azusawa/levit';
const root = resolve(import.meta.dirname, '../..');
const version: string = JSON.parse(readFileSync(resolve(root, 'packages/levit/package.json'), 'utf8')).version;

/** The page's path under the site root: '', 'guide/', 'ko/', 'ko/docs/'… */
export function pagePath(lang: Lang, kind: Kind): string {
  return `${lang === 'en' ? '' : `${lang}/`}${kind === 'landing' ? '' : `${kind}/`}`;
}

/** The page a path belongs to, the reverse of pagePath. */
export function pageFor(path: string): { lang: Lang; kind: Kind } | undefined {
  const clean = path.replace(/^\/+/, '').replace(/index\.html$/, '');
  return PAGES.find((p) => pagePath(p.lang, p.kind) === clean);
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline Markdown-ish text from the strings: only `code` is marked up. */
const inline = (text: string) => escape(text).replace(/`([^`]+)`/g, '<code>$1</code>');

interface Options {
  /** The path the site is served under, like '/levit/'. */
  base: string;
  /** The site's full address, for canonical and alternate links. */
  siteUrl?: string;
}

export function renderPage(lang: Lang, kind: Kind, { base, siteUrl = SITE_URL }: Options): string {
  const s = strings[lang];
  const link = (l: Lang, k: Kind) => `${base}${pagePath(l, k)}`;
  const doc = kind === 'landing' ? null : renderDoc(readFileSync(resolve(root, `site/content/${lang}/${kind}.md`), 'utf8'));
  const title = kind === 'landing' ? s.meta.landingTitle : kind === 'guide' ? s.meta.guideTitle : s.meta.docsTitle;
  const description =
    kind === 'landing' ? s.meta.landingDescription : kind === 'guide' ? s.meta.guideDescription : s.meta.docsDescription;

  const alternates = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${siteUrl}${pagePath(l, kind)}">`).join('\n  ');

  const nav = `
  <a class="skip" href="#main">${escape(s.doc.skip)}</a>
  <header class="site-header">
    <a class="wordmark" href="${link(lang, 'landing')}" aria-label="${escape(s.nav.home)}">
      <svg class="mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="12"/><path d="M23 16h7v26h15v6H23z"/></svg>
      <span>Levit</span>
    </a>
    <nav class="site-nav" aria-label="Levit">
      <a href="${link(lang, 'guide')}"${kind === 'guide' ? ' aria-current="page"' : ''}>${escape(s.nav.guide)}</a>
      <a href="${link(lang, 'docs')}"${kind === 'docs' ? ' aria-current="page"' : ''}>${escape(s.nav.docs)}</a>
      <a href="${REPO}">${escape(s.nav.github)}</a>
    </nav>
    <nav class="langs" aria-label="${escape(s.nav.language)}">
      ${LANGS.map(
        (l) =>
          `<a href="${link(l, kind)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${escape(strings[l].langName)}</a>`
      ).join('\n      ')}
    </nav>
    <a class="button button-small" href="${link(lang, 'docs')}">${escape(s.nav.cta)}</a>
  </header>`;

  const body = kind === 'landing' ? landing(s, lang, link) : docPage(s, lang, kind, doc!, description);

  return `<!doctype html>
<html lang="${lang}" data-page="${kind}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <link rel="canonical" href="${siteUrl}${pagePath(lang, kind)}">
  ${alternates}
  <link rel="alternate" hreflang="x-default" href="${siteUrl}${pagePath('en', kind)}">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${siteUrl}${pagePath(lang, kind)}">
  <link rel="icon" type="image/svg+xml" href="${base}logo.svg">
  <link rel="preconnect" href="https://api.fontshare.com">
  <link rel="preconnect" href="https://cdn.fontshare.com" crossorigin>
  <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,700&display=swap">
  <script type="module" src="/src/${kind === 'landing' ? 'landing' : 'doc'}.ts"></script>
</head>
<body>
${nav}
${body}
${footer(s, lang, link)}
</body>
</html>
`;
}

type LinkFn = (lang: Lang, kind: Kind) => string;

function landing(s: SiteStrings, lang: Lang, link: LinkFn): string {
  const p = s.playground;
  const tabs = ['write', 'ai', 'together', 'comments'] as const;
  const tabButtons = tabs
    .map(
      (t, i) =>
        `<button role="tab" id="tab-${t}" data-tab="${t}" aria-controls="panel-${t}" aria-selected="${i === 0}"${i === 0 ? '' : ' tabindex="-1"'}>${escape(p.tabs[t])}</button>`
    )
    .join('');

  const panels = `
        <div class="pg-panel" role="tabpanel" id="panel-write" aria-labelledby="tab-write" data-panel="write">
          <div class="pg-editor" data-editor="write"></div>
        </div>
        <div class="pg-panel" role="tabpanel" id="panel-ai" aria-labelledby="tab-ai" data-panel="ai" hidden>
          <div class="pg-actions">
            <button type="button" data-ai="improve">${escape(p.ai.improve)}</button>
            <button type="button" data-ai="continue">${escape(p.ai.continue)}</button>
            <button type="button" data-ai="summarize">${escape(p.ai.summarize)}</button>
            <button type="button" data-ai="stop" disabled>${escape(p.ai.stop)}</button>
          </div>
          <div class="pg-editor" data-editor="ai"></div>
        </div>
        <div class="pg-panel" role="tabpanel" id="panel-together" aria-labelledby="tab-together" data-panel="together" hidden>
          <div class="pg-pair">
            <div class="pg-person"><p class="pg-name" style="--who:#e11d48">${escape(p.together.left)}</p><div class="pg-editor" data-editor="left"></div></div>
            <div class="pg-person"><p class="pg-name" style="--who:#0d7480">${escape(p.together.right)}</p><div class="pg-editor" data-editor="right"></div></div>
          </div>
        </div>
        <div class="pg-panel" role="tabpanel" id="panel-comments" aria-labelledby="tab-comments" data-panel="comments" hidden>
          <div class="pg-split">
            <div>
              <div class="pg-actions"><button type="button" data-comment-add>${escape(p.comments.add)}</button></div>
              <div class="pg-editor" data-editor="comments"></div>
            </div>
            <aside class="pg-comments" aria-label="${escape(p.comments.title)}">
              <p class="pg-comments-title">${escape(p.comments.title)}</p>
              <ol class="pg-comment-list" data-comment-list></ol>
              <p class="pg-comments-empty" data-comment-empty>${escape(p.comments.empty)}</p>
            </aside>
          </div>
        </div>`;

  const hints = tabs.map((t) => `<p class="pg-hint" data-hint="${t}"${t === 'write' ? '' : ' hidden'}>${escape(p.hints[t])}</p>`).join('');

  const f = s.formats;
  const fx = s.features.fragments;
  const menuKeys = ['heading1', 'bulletList', 'taskList', 'codeBlock', 'image'] as const;
  const fragments = [
    `<pre class="band-pre"><code>$ npm install @yonailab/levit\nadded 1 package in 1s\n\n$ npm ls --all\nmy-app@1.0.0\n└── @yonailab/levit@${version}</code></pre>`,
    `<p class="band-caption" data-big-caption data-loading="${escape(fx.bigLoading)}">${escape(fx.big)}</p><div class="band-editor" data-big-editor></div>`,
    `<div class="band-menus">${[enMessages, koMessages, jaMessages]
      .map((m, j) => `<ul lang="${LANGS[j]}">${menuKeys.map((k) => `<li>${escape(m[k])}</li>`).join('')}</ul>`)
      .join('')}</div>`,
    `<div class="band-paste"><p class="band-caption">${escape(fx.pasted)}</p><pre data-paste-in></pre><p class="band-caption">${escape(fx.kept)}</p><pre data-paste-out></pre></div>`,
    `<ul class="band-browsers">${[['Chrome', '87'], ['Edge', '88'], ['Firefox', '78'], ['Safari', '14']]
      .map(([n, v]) => `<li><span>${n}</span><span>${v}+</span></li>`)
      .join('')}</ul><p class="band-caption">${escape(fx.tested)}</p>`,
  ];
  const features = s.features.items
    .map(
      (item, i) => `
      <div class="band${i < 2 ? ' is-on' : ''}" data-band="${i}">
        <div class="band-text">
          <p class="band-sentence" id="band-${i}">${escape(item.sentence)}</p>
          <p class="band-detail" id="band-detail-${i}">${inline(item.detail)}</p>
        </div>
        <div class="band-ui" data-ui>${fragments[i]}</div>
        <button class="switch" role="switch" aria-checked="${i < 2}" aria-labelledby="band-${i}" aria-describedby="band-detail-${i}" data-ui><span></span></button>
      </div>`
    )
    .join('');

  const cards = [
    `npm install @yonailab/levit`,
    `import { createLevitEditor } from '@yonailab/levit';\nimport '@yonailab/levit/levit.css';\n\nconst editor = createLevitEditor(\n  document.querySelector('#editor'),\n);`,
    `const editor = createLevitEditor(el, {\n  onChange: (editor) =>\n    save(editor.getJSON()),\n});`,
    `createLevitEditor(el, {\n  plugins: [\n    commentsPlugin(),\n    aiPlugin({ provider }),\n  ],\n});\nbindYjs(editor, ydoc.getArray('blocks'));`,
  ];
  const steps = s.steps.items
    .map(
      (clause, i) => `
      <li class="field">
        ${i === 0 ? `<h2 class="field-heading" id="steps-heading">${escape(s.steps.heading)}</h2>` : ''}
        <pre class="card" data-ui data-language="${i === 0 ? 'bash' : 'ts'}"><code>${escape(cards[i])}</code></pre>
        <p class="field-clause">${escape(clause)}</p>
      </li>`
    )
    .join('');

  const row = (dot: string, name: string, value: string, href?: string) => `
        <li class="row"><span class="dot" style="--dot:${dot}"></span>${
          href ? `<a href="${href}">${escape(name)}</a>` : `<span>${escape(name)}</span>`
        }<span class="value">${escape(value)}</span></li>`;
  const l = s.list;
  const list = `
      <p class="group">${escape(l.groups.packages)}</p>
      <ul class="rows">${[
        row('#2563eb', '@yonailab/levit', l.packages.core, 'https://www.npmjs.com/package/@yonailab/levit'),
        row('#0ea5e9', '@yonailab/levit-react', l.packages.react, 'https://www.npmjs.com/package/@yonailab/levit-react'),
        row('#16a34a', '@yonailab/levit-vue', l.packages.vue, 'https://www.npmjs.com/package/@yonailab/levit-vue'),
        row('#e11d48', '@yonailab/levit-yjs', l.packages.yjs, 'https://www.npmjs.com/package/@yonailab/levit-yjs'),
      ].join('')}
      </ul>
      <p class="group">${escape(l.groups.read)}</p>
      <ul class="rows">${[
        row('#1f3038', l.read.guide, s.nav.guide, link(lang, 'guide')),
        row('#1f3038', l.read.docs, s.nav.docs, link(lang, 'docs')),
        row('#1f3038', l.read.llms, 'llms.txt', `${REPO}/blob/main/llms.txt`),
        row('#1f3038', l.read.github, 'azusawa/levit', REPO),
      ].join('')}
      </ul>`;

  const faq = s.faq.items
    .map(
      (item, i) => `
        <details class="tile" name="faq"${i === 0 ? ' open' : ''}>
          <summary>${inline(item.q)}<span class="plus" aria-hidden="true"></span></summary>
          <p>${inline(item.a)}</p>
        </details>`
    )
    .join('');

  return `
  <main id="main">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-text">
        <h1 id="hero-title">${escape(s.hero.title)}</h1>
        <p class="lead">${escape(s.hero.lead)}</p>
        <div class="install" data-ui>
          <code>npm install @yonailab/levit</code>
          <button type="button" data-copy="npm install @yonailab/levit" aria-label="${escape(s.hero.copyLabel)}" data-copied="${escape(s.hero.copied)}">${escape(s.hero.copy)}</button>
        </div>
      </div>
      <div class="playground" id="playground" data-ui data-lang="${lang}" aria-label="${escape(p.label)}" role="region">
        <div class="pg-bar">
          <div role="tablist" aria-label="${escape(p.label)}">${tabButtons}</div>
          <div class="pg-tools">
            <label class="pg-menus">${escape(p.menus)}
              <select data-menus>
                ${LANGS.map((m) => `<option value="${m}"${m === lang ? ' selected' : ''}>${escape(strings[m].langName)}</option>`).join('')}
              </select>
            </label>
            <label class="pg-theme"><input type="checkbox" data-theme-toggle> ${escape(p.theme)}</label>
          </div>
        </div>
        ${panels}
        <div class="pg-foot">${hints}</div>
      </div>
    </section>

    <section class="formats" aria-labelledby="formats-heading">
      <h2 id="formats-heading">${escape(f.heading)}</h2>
      <p class="formats-lead">${escape(f.lead)}</p>
      <input class="formats-input" data-ui data-formats-input type="text" value="${escape(f.initial)}" aria-label="${escape(f.inputLabel)}" spellcheck="false" autocomplete="off">
      <div class="formats-out" data-ui>
        <div class="out-row"><p class="out-label">Levit</p><div class="out-preview levit-editor" data-out="preview"></div></div>
        <div class="out-row"><p class="out-label">HTML</p><pre><code data-out="html"></code></pre></div>
        <div class="out-row"><p class="out-label">JSON</p><pre><code data-out="json"></code></pre></div>
      </div>
      <div class="examples" role="group" aria-label="${escape(f.examplesLabel)}">
        ${f.examples.map((e) => `<button type="button" data-example="${escape(e)}">${escape(e)}</button>`).join('')}
      </div>
    </section>

    <section class="features" aria-labelledby="features-heading">
      <h2 id="features-heading" class="features-heading">${escape(s.features.heading)}</h2>
      ${features}
    </section>

    <section class="steps" aria-labelledby="steps-heading">
      <ol class="fields">${steps}
      </ol>
    </section>

    <section class="list" aria-labelledby="list-heading">
      <h2 id="list-heading">${escape(l.heading)}</h2>
      ${list}
    </section>

    <section class="faq" aria-labelledby="faq-heading">
      <h2 id="faq-heading">${escape(s.faq.heading)}</h2>
      <div class="tiles">${faq}
      </div>
    </section>
  </main>`;
}

function docPage(s: SiteStrings, lang: Lang, kind: Kind, doc: ReturnType<typeof renderDoc>, description: string): string {
  const toc = doc.toc
    .map(
      (e) =>
        `<li><a href="#${encodeURIComponent(e.id)}">${escape(e.text)}</a>${
          e.children?.length
            ? `<ol>${e.children.map((c) => `<li><a href="#${encodeURIComponent(c.id)}">${escape(c.text)}</a></li>`).join('')}</ol>`
            : ''
        }</li>`
    )
    .join('\n          ');
  return `
  <main id="main" class="doc">
    <div class="doc-head">
      <h1>${escape(doc.title)}</h1>
      <p class="lead">${escape(description)}</p>
    </div>
    <div class="doc-body">
      <nav class="toc" aria-label="${escape(s.doc.onThisPage)}">
        <p class="toc-title">${escape(s.doc.onThisPage)}</p>
        <ol>
          ${toc}
        </ol>
      </nav>
      <article class="prose levit-editor">
        ${doc.html}
        <p class="edit"><a href="${REPO}/blob/main/site/content/${lang}/${kind}.md">${escape(s.doc.edit)}</a></p>
      </article>
    </div>
  </main>`;
}

function footer(s: SiteStrings, lang: Lang, link: LinkFn): string {
  const f = s.footer;
  return `
  <footer class="site-footer">
    <div class="tile tile-statement">
      <p>${escape(f.statement)}</p>
      <p class="legal">${escape(f.legal)}</p>
    </div>
    <nav class="tile tile-nav" aria-label="Levit">
      <a href="${link(lang, 'landing')}">Levit</a>
      <a href="${link(lang, 'guide')}">${escape(s.nav.guide)}</a>
      <a href="${link(lang, 'docs')}">${escape(s.nav.docs)}</a>
      <a href="${REPO}">${escape(s.nav.github)}</a>
    </nav>
    <div class="tile tile-version">
      <p>${escape(f.version)} ${version}</p>
      <p class="legal">${escape(f.released)}</p>
    </div>
    <div class="tile tile-issues">
      <a href="${REPO}/issues">${escape(f.issues)}</a>
    </div>
    <div class="tile tile-word" aria-hidden="true">Levit</div>
    <a class="tile tile-invite" href="${link(lang, 'docs')}">
      <span>${escape(f.invite)}</span>
      <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 38 38 10M16 10h22v22"/></svg>
    </a>
  </footer>`;
}
