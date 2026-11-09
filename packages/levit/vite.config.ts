import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      // Two entry points; code they share goes into a common chunk.
      entry: {
        index: resolve(import.meta.dirname, 'src/index.ts'),
        ai: resolve(import.meta.dirname, 'src/ai/index.ts'),
      },
      name: 'Levit',
      fileName: (_format, name) => `${name}.js`,
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        exports: 'named',
      },
    },
    sourcemap: true,
    // Set here, not left to Vite: its default changes between major versions.
    // Also used for the CSS.
    target: ['es2020', 'edge88', 'firefox78', 'chrome87', 'safari14'],
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    name: 'levit',
    // Undo vi.stubGlobal after every test, even one that failed.
    unstubGlobals: true,
    environment: 'happy-dom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
  },
});

