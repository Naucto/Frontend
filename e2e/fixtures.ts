import { test as base } from '@playwright/test';

/**
 * Answers every request off this origin with 404, which every page survives; set up before the
 * hooks, so a spec's own routes still win.
 */
export const test = base.extend<{ onlyThisOrigin: boolean }>({
  onlyThisOrigin: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL ?? 'http://localhost:3001').origin;
      await page.route(
        (url) => url.origin !== origin,
        (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }),
      );
      await use(true);
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
