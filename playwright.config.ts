import { defineConfig, devices } from '@playwright/test';

import { getOptionalEnv } from './tools/env';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: getOptionalEnv('CI', false),
  retries: getOptionalEnv('CI', false) ? 2 : 0,
  reporter: getOptionalEnv('CI', false) ? 'github' : 'list',
  use: {
    baseURL: getOptionalEnv('E2E_BASE_URL', 'http://localhost:3001'),
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
  webServer: getOptionalEnv('E2E_BASE_URL')
    ? undefined
    : {
        command: 'npm start',
        url: 'http://localhost:3001',
        reuseExistingServer: !getOptionalEnv('CI', false),
        timeout: 120_000,
      },
});
