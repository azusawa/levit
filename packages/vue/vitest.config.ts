import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Test against the core's source, so no build is needed first.
    alias: { '@yonailab/levit': fileURLToPath(new URL('../levit/src/index.ts', import.meta.url)) },
  },
  test: {
    name: 'vue',
    environment: 'happy-dom',
  },
});
