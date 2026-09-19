import { readFileSync } from 'node:fs';

import { type Locator, type Page, test } from '@playwright/test';

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

/** The whole viewport, or one element of it, as a picture of its own. */
const shoot = async (
  page: Page,
  name: string,
  theme: (typeof THEMES)[number],
  part?: Locator,
): Promise<void> => {
  const suffix = theme === 'light' ? '.light' : '';
  const path = `${OUT}/${name}${suffix}.png`;
  if (part) await part.screenshot({ path, animations: 'disabled' });
  else await page.screenshot({ path });
};

/** A panel of the right column, found by the label it prints. */
const section = (page: Page, title: string): Locator =>
  page.locator('nc-section').filter({ has: page.getByText(title, { exact: true }) }).first();

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
      await shoot(page, 'art-tools', theme, page.locator('nc-tool-group').first());
      await shoot(page, 'art-sheet', theme, section(page, 'Sheet'));
      await shoot(page, 'art-flags', theme, section(page, 'Flags'));
      await shoot(page, 'art-palette', theme, section(page, 'Palette'));
      await page.getByRole('button', { name: 'Sheet size' }).click();
      await shoot(page, 'art-size-dialog', theme, page.getByRole('dialog'));
      await page.keyboard.press('Escape');
    });

    test('map', async ({ page }) => {
      await page.goto('/edit/7/map');
      await page.getByRole('img', { name: 'Map canvas' }).waitFor();
      await page.waitForTimeout(500);
      await shoot(page, 'map', theme);
      await shoot(page, 'map-tools', theme, page.locator('nc-tool-group').first());
      await shoot(page, 'map-brush', theme, page.locator('nc-sheet-view').first());
      await shoot(page, 'map-minimap', theme, section(page, 'Whole map'));
    });

    test('code', async ({ page }) => {
      await page.goto('/edit/7/code');
      await page.getByRole('tab', { name: 'main', exact: true }).waitFor();
      await page.waitForTimeout(500);
      await shoot(page, 'code', theme);
      await shoot(page, 'code-tabs', theme, page.getByRole('tablist').first());
      await shoot(page, 'code-console', theme, page.locator('nc-console-column'));
      // The reference, opened beside the console the way F1 opens it.
      await page.keyboard.press('F1');
      await page.locator('nc-doc-pane').waitFor();
      await page.waitForTimeout(300);
      await shoot(page, 'code-reference', theme);
      await shoot(page, 'code-reference-pane', theme, page.locator('nc-doc-pane'));
    });

    test('sound', async ({ page }) => {
      await page.goto('/edit/7/sound');
      await page.getByRole('img', { name: 'Piano roll' }).waitFor();
      await page.waitForTimeout(500);
      await shoot(page, 'sound', theme);
      await shoot(page, 'sound-instruments', theme, page.locator('nc-instrument-list'));
      await shoot(page, 'sound-roll', theme, page.locator('nc-piano-roll'));
      await shoot(page, 'sound-inspector', theme, page.locator('nc-instrument-inspector'));
      await shoot(page, 'sound-sfx', theme, page.locator('nc-slot-grid').first());
      await shoot(page, 'sound-music', theme, page.locator('nc-song-list'));
      await shoot(page, 'sound-transport', theme, page.locator('nc-transport').first());
      // The help bubble the "?" beside the SFX slots opens.
      await page.getByRole('button', { name: /^Numbered slots/ }).hover();
      await page.getByRole('tooltip').waitFor();
      await shoot(page, 'sound-sfx-help', theme, page.getByRole('tooltip'));
      await page.mouse.move(0, 0);
      // A new instrument: the choice, then the shelves of presets.
      await page.getByRole('button', { name: 'Add instrument' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'New instrument' });
      await shoot(page, 'sound-new-instrument', theme, dialog);
      await dialog.getByRole('button', { name: 'From a preset' }).click();
      await dialog.getByRole('tab', { name: 'Drums' }).click();
      await dialog.getByRole('radio', { name: 'Kick' }).click();
      await shoot(page, 'sound-presets', theme, dialog);
      await page.keyboard.press('Escape');
    });

    test('game', async ({ page }) => {
      // A history worth showing: the mock's empty lists would picture the panel with nothing in it.
      await page.route('**/projects/7/versions', (r) =>
        r.fulfill({
          json: {
            versions: [
              { name: 'save-3', date: '2026-09-19T09:40:00.000Z' },
              { name: 'save-2', date: '2026-09-18T17:12:00.000Z' },
              { name: 'save-1', date: '2026-09-12T08:05:00.000Z' },
            ],
          },
        }),
      );
      await page.route('**/projects/7/checkpoints', (r) =>
        r.fulfill({
          json: [
            { name: 'v2 double jump', date: '2026-09-18T16:00:00.000Z' },
            { name: 'v1 first level', date: '2026-09-11T10:30:00.000Z' },
          ],
        }),
      );
      await page.goto('/edit/7/game');
      await page.getByRole('textbox', { name: 'Name' }).waitFor();
      await page.waitForTimeout(500);
      await shoot(page, 'game', theme);
      await page.getByRole('button', { name: 'Platformer' }).click();
      const panel = page.locator('nc-popover-panel');
      await shoot(page, 'game-versions', theme, panel);
      await panel.getByRole('button', { name: 'Save a version' }).click();
      await shoot(page, 'game-save-version', theme, page.getByRole('dialog', { name: 'Save a version' }));
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Share' }).click();
      await shoot(page, 'game-share', theme, page.getByRole('dialog'));
      await page.keyboard.press('Escape');
    });
  });
}
