import { defineConfig } from 'vite';

// The demo and the browser tests (npx vite at the root) load the packages'
// sources. Packages that import the core get its source too, not its build,
// so there is one copy of the core on the page.
export default defineConfig({
  resolve: {
    alias: [{ find: /^@yonailab\/levit$/, replacement: `${import.meta.dirname}/packages/levit/src/index.ts` }],
  },
});
