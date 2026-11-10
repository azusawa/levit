// The website: a landing page with a live editor, the user guide and the
// developer docs, in English, Korean and Japanese. Every page file is a stub;
// site/lib/pages.ts writes its HTML. Published to GitHub Pages under /levit/.
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { PAGES, pageFor, pagePath, renderPage } from './lib/pages.ts';

const root = import.meta.dirname;
const packages = resolve(root, '../packages');
const base = process.env.SITE_BASE ?? '/levit/';

function pages(): Plugin {
  return {
    name: 'levit-site-pages',
    transformIndexHtml: {
      order: 'pre',
      handler(_html, ctx) {
        const page = pageFor(ctx.path);
        if (!page) throw new Error(`No site page for ${ctx.path}`);
        return renderPage(page.lang, page.kind, { base });
      },
    },
    // Rebuild a page in the dev server when its Markdown or strings change.
    handleHotUpdate({ file, server }) {
      if (/site\/(content|lib)\//.test(file)) server.ws.send({ type: 'full-reload' });
    },
  };
}

export default defineConfig({
  root,
  base,
  publicDir: resolve(root, 'public'),
  plugins: [pages()],
  resolve: {
    // The site runs on the packages' sources, so it always shows this commit.
    alias: [
      { find: /^@yonailab\/levit$/, replacement: resolve(packages, 'levit/src/index.ts') },
      { find: /^@yonailab\/levit\/ai$/, replacement: resolve(packages, 'levit/src/ai/index.ts') },
      { find: /^@yonailab\/levit\/levit\.css$/, replacement: resolve(packages, 'levit/src/ui/theme.css') },
      { find: /^@yonailab\/levit-yjs$/, replacement: resolve(packages, 'yjs/src/index.ts') },
    ],
  },
  build: {
    outDir: resolve(root, '../dist-site'),
    emptyOutDir: true,
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
    rollupOptions: {
      input: Object.fromEntries(
        PAGES.map(({ lang, kind }) => [`${lang}-${kind}`, resolve(root, pagePath(lang, kind), 'index.html')])
      ),
    },
  },
  server: { port: 5191 },
});
