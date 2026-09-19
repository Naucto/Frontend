import { readFileSync } from 'node:fs';

import { type Page, test } from '@playwright/test';

import { mockEditor } from '../editor-mocks';

/**
 * The pictures the documentation shows of each editor, taken from one seeded game so that they
 * can be taken again when the app changes and still show the same thing.
 *
 * One shot per theme: the page shows whichever matches the theme it is read in. The game is the
 * Platformer the seed writes — sprites, a map, a song and code — built by `seed:content` into the
 * file `docs:shots` names, since the engine cannot be imported from a spec directly.
 */
const CONTENT_FILE = 'node_modules/.cache/docs-shots/platformer.bin';
const OUT = 'docs/content/editors/img';
const THEMES = ['dark', 'light'] as const;

const shoot = async (page: Page, name: string, theme: (typeof THEMES)[number]): Promise<void> => {
  const suffix = theme === 'light' ? '.light' : '';
  await page.screenshot({ path: `${OUT}/${name}${suffix}.png` });
};

for (const theme of THEMES) {
  test.describe(`editors (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      // Read here and not at load: a test run that lists every project loads this file too, and
      // the game only exists once docs:shots has written it.
      await mockEditor(page, { theme, content: readFileSync(CONTENT_FILE) });
    });

    test('art', async ({ page }) => {
      await page.goto('/edit/7/art');
      await page.getByRole('img', { name: 'Sprite canvas' }).waitFor();
      await page.waitForTimeout(500);
      await shoot(page, 'art', theme);
    });

    test('map', async ({ page }) => {
      await page.goto('/edit/7/map');
      await page.getByRole('img', { name: 'Map canvas' }).waitFor();
      await page.waitForTimeout(500);
      await shoot(page, 'map', theme);
    });

    test('code', async ({ page }) => {
      await page.goto('/edit/7/code');
      await page.getByRole('tab', { name: 'main', exact: true }).waitFor();
      await page.waitForTimeout(500);
      await shoot(page, 'code', theme);
      // The reference, opened beside the console the way F1 opens it.
      await page.keyboard.press('F1');
      await page.locator('nc-doc-pane').waitFor();
      await page.waitForTimeout(300);
      await shoot(page, 'code-reference', theme);
    });

    test('sound', async ({ page }) => {
      await page.goto('/edit/7/sound');
      await page.getByRole('img', { name: 'Piano roll' }).waitFor();
      await page.waitForTimeout(500);
      await shoot(page, 'sound', theme);
    });
  });
}
