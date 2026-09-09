import { test as base } from '@playwright/test';

/**
 * No test reaches a server that is not this one.
 *
 * Whatever a developer happens to be running decides otherwise: a call nobody mocked is a refusal
 * in one second and an answer in the next, and an answer of 401 sends the app through a token
 * refresh and a retry before the assertion below it runs. A run that depends on that is a run that
 * fails for reasons the diff cannot explain.
 *
 * Anything off this origin is answered 404, which every page here is written to survive — the
 * flags read as off, the lists read as empty, and the guards read as signed out. The fixture is
 * set up before the hooks, and routes are matched newest first, so a spec's own mocks still win.
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
