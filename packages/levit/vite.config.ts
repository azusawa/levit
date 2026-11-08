import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      // Two entry points; code they share goes into a common chunk.
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        ai: resolve(__dirname, 'src/ai/index.ts'),
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
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
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

