import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      // Each package has its own test setup.
      'packages/*',
      // Checks on the repository itself: docs, links, CI.
      {
        test: {
          name: 'project',
          include: ['tests/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
