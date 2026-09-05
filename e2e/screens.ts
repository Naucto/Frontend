import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { type Page } from '@playwright/test';

interface Stub {
  pattern: string;
  json?: unknown;
  status?: number;
  body?: string;
  contentType?: string;
}

interface Screens {
  shared?: { localStorage?: Record<string, string>; routes?: Stub[] };
}

/**
 * The same file the design comparison reads.
 *
 * A screen the app cannot render is a screen nobody can compare, so what it takes to render one is
 * worth exactly one definition. Kept here as well, a stub would answer one way for the tests and
 * another for the comparison, and the two would drift without either failing.
 */
const FILE = fileURLToPath(new URL('../tools/design-screens.json', import.meta.url));

/**
 * Puts a page in the state every authenticated screen needs, without a session.
 *
 * The app's whole boot is a refresh followed by a profile, so answering those two is what standing
 * in for a signed-in person amounts to; the rest is about keeping a screen from erroring once it is
 * up. Registration order is observable — Playwright resolves the most recently registered route
 * first — so the file's order is preserved rather than sorted.
 */
export async function prepareApp(page: Page): Promise<void> {
  const { shared } = JSON.parse(readFileSync(FILE, 'utf8')) as Screens;

  await page.addInitScript(
    (entries: [string, string][]) => {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
    Object.entries(shared?.localStorage ?? {}),
  );

  for (const stub of shared?.routes ?? []) {
    const status = stub.status === undefined ? {} : { status: stub.status };
    await page.route(stub.pattern, (route) =>
      // An entry carrying a body as well is answered with the JSON and nothing else. The rule is
      // the file's, not the driver's, and the two readers of this file have to answer it the same
      // way — a screen that differed by who read it would blame the application for the reader.
      route.fulfill(
        stub.json === undefined
          ? {
              ...status,
              ...(stub.body === undefined ? {} : { body: stub.body }),
              ...(stub.contentType === undefined ? {} : { contentType: stub.contentType }),
            }
          : { ...status, json: stub.json },
      ),
    );
  }
}
