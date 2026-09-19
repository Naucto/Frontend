import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { test } from '@playwright/test';

import { mockEditor } from '../editor-mocks';
import { grabFrame } from './frame';

/** The frames the API reference shows: one Lua scene per picture, run in the editor's viewer. */
const DEMOS = 'node_modules/.cache/docs-shots/demos';
const OUT = 'docs/api/img/frames';

const demos = existsSync(DEMOS)
  ? readdirSync(DEMOS)
      .filter((f) => f.endsWith('.bin'))
      .map((f) => basename(f, '.bin'))
  : [];

for (const name of demos) {
  test(`frame ${name}`, async ({ page }) => {
    await mockEditor(page, { content: readFileSync(join(DEMOS, `${name}.bin`)) });
    await page.goto('/edit/7/code');
    await page.locator('nc-game-screen canvas').first().waitFor();
    // Opening the editor does not start the game; pressing Play does.
    await page.getByRole('button', { name: 'Play' }).first().click();
    // Enough frames for the loop to have drawn, and for a static scene that is every one of them.
    await page.waitForTimeout(1200);
    await grabFrame(page, join(OUT, `${name}.png`));
  });
}
