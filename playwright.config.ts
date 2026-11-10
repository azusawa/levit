import { defineConfig, devices } from '@playwright/test';

const PORT = 5190;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // The installed Google Chrome, so Chrome needs no separate download.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/e2e/fixture.html`,
      reuseExistingServer: !process.env.CI,
    },
    // The website (site/), for e2e/site.spec.ts.
    {
      command: `npx vite --config site/vite.config.ts --port ${PORT + 3} --strictPort`,
      url: `http://localhost:${PORT + 3}/levit/`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
