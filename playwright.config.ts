import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', testIgnore: /\/docs\//, use: { ...devices['Desktop Chrome'] } },
    // A second engine only for the frame-rate baseline; the rest of the suite pins DOM contracts
    // that do not depend on which browser renders them.
    { name: 'firefox', testMatch: /perf\.spec\.ts/, use: { ...devices['Desktop Firefox'] } },
    // Not a test run: the captures the documentation shows, taken from seeded content so they can
    // be taken again when the app changes. Run with `npm run docs:shots`, never by `npm run e2e`.
    {
      name: 'docs-shots',
      testDir: 'e2e/docs',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm start',
        url: 'http://localhost:3001',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
