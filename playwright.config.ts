import { defineConfig } from '@playwright/test';

const PORT = 5190;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Use the installed Google Chrome so no separate browser download is needed.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/e2e/fixture.html`,
    reuseExistingServer: !process.env.CI,
  },
});
