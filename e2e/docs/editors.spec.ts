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
      // Narrower: the sprites renumber, and the dialog says what follows them.
      const width = page.getByRole('dialog').getByRole('textbox', { name: 'Width' });
      await width.fill('64');
      await width.press('Enter');
      await page.getByRole('dialog').getByText(/map tiles follow/).waitFor();
      await shoot(page, 'art-size-dialog-cost', theme, page.getByRole('dialog'));
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Presets' }).click();
      await shoot(page, 'art-presets', theme, page.locator('nc-popover-panel'));
      await page.keyboard.press('Escape');
      // A selection on the player sprites, and the bar that flips and turns it.
      await page.getByRole('switch', { name: 'Lock' }).click();
      await page.getByRole('radio', { name: 'Select' }).click();
      const canvas = await page.getByRole('img', { name: 'Sprite canvas' }).boundingBox();
      if (!canvas) throw new Error('no canvas');
      const px = canvas.width / 128;
      await page.mouse.move(canvas.x + 1 * px, canvas.y + 1 * px);
      await page.mouse.down();
      await page.mouse.move(canvas.x + 30 * px, canvas.y + 7 * px, { steps: 6 });
      await page.mouse.up();
      const bar = page.getByRole('toolbar', { name: 'Transform the selection' });
      await bar.waitFor();
      await shoot(page, 'art-transform', theme, page.locator('nc-sprite-canvas'));
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
      // Wide enough for the reference to stand beside the console instead of in its place.
      await page.setViewportSize({ width: 1700, height: 900 });
      await page.waitForTimeout(300);
      await shoot(page, 'code-reference-split', theme);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: 'Swap back to the game' }).click();
      await page.locator('nc-doc-pane').waitFor({ state: 'hidden' });

      // Find and replace, with a pattern.
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+f');
      const search = page.locator('nc-search-bar');
      await search.getByRole('checkbox', { name: 'Regexp' }).click();
      await search.getByRole('textbox', { name: 'Find' }).fill('player\\.[xy]');
      await search.getByRole('button', { name: 'Replace', exact: true }).click();
      await search.getByRole('textbox', { name: 'Replace with' }).fill('me.$&');
      await page.waitForTimeout(200);
      await shoot(page, 'code-find', theme, search);
      await page.keyboard.press('Escape');

      // The signature of the call being written, argument in hand.
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\ngfx.draw_sprite(0, ');
      const tip = page.locator('.cm-tooltip:has(.nc-doc-card__sig)');
      await tip.waitFor();
      await page.waitForTimeout(300);
      await shoot(page, 'code-signature', theme, tip);
      await page.keyboard.press('Escape');

      // A runtime error: the line, the gutter, the status bar and the Console badge.
      await page.keyboard.press('Control+a');
      await page.keyboard.type(
        'function _update()\n  local t = nil\n  t.x = 1\nend\nfunction _draw()\n  gfx.clear(0)\nend\n',
      );
      await page.getByRole('button', { name: 'Play' }).first().click();
      await page.getByText('1 error').waitFor();
      await page.waitForTimeout(300);
      await shoot(page, 'code-error', theme);
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
      // Five places filled with pattern 0 and one left empty: the orange hole the music stops at.
      const cells = page.locator('nc-song-list [role="group"] input');
      for (const i of [0, 1, 2, 4, 5]) {
        await cells.nth(i).fill('0');
        await cells.nth(i).press('Enter');
      }
      await page.waitForTimeout(200);
      await shoot(page, 'sound-music', theme, page.locator('nc-song-list'));
      await shoot(page, 'sound-transport', theme, page.locator('nc-transport').first());
      // The help bubble the "?" beside the SFX slots opens.
      await page.getByRole('button', { name: /^Numbered slots/ }).hover();
      await page.getByRole('tooltip').waitFor();
      await shoot(page, 'sound-sfx-help', theme, page.getByRole('tooltip'));
      await page.mouse.move(0, 0);
      await page.getByRole('button', { name: 'Add instrument' }).first().click();
      const dialog = page.getByRole('dialog', { name: 'New instrument' });
      await shoot(page, 'sound-new-instrument', theme, dialog);
      await dialog.getByRole('button', { name: 'From a preset' }).click();
      await dialog.getByRole('tab', { name: 'Drums' }).click();
      await dialog.getByRole('radio', { name: 'Kick' }).click();
      await shoot(page, 'sound-presets', theme, dialog);
      await page.keyboard.press('Escape');
    });

    test('net', async ({ page }) => {
      await page.goto('/edit/7/net');
      await page.getByRole('button', { name: 'Declare a path' }).click();
      await page.getByPlaceholder('key').fill('score');
      await page.keyboard.press('Enter');
      await page.getByTitle('Add child node').first().click();
      await page.getByPlaceholder('key').fill('winner');
      await page.keyboard.press('Enter');
      const winner = page.getByRole('row').filter({ hasText: 'winner' });
      await winner.getByTitle('Clients can write this path').click();
      await page.waitForTimeout(500);
      await shoot(page, 'net', theme);
      await shoot(page, 'net-state', theme, page.locator('nc-net-tab-page section').first());
      await shoot(page, 'net-session', theme, page.locator('nc-panel-column').first());
      await shoot(page, 'net-rig', theme, section(page, 'Test rig'));
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
      await page.locator('header').getByRole('button', { name: 'Publish' }).click();
      await shoot(page, 'game-publish', theme, page.getByRole('dialog'));
      await page.keyboard.press('Escape');
    });

    test('the floating viewer', async ({ page }) => {
      await page.goto('/edit/7/code');
      await page.getByRole('tab', { name: 'main', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Play' }).first().click();
      await page.getByRole('button', { name: 'Pop the viewer out' }).click();
      await page.locator('nc-rail').getByRole('button', { name: 'Map' }).click();
      await page.getByRole('img', { name: 'Map canvas' }).waitFor();
      await page.waitForTimeout(600);
      await shoot(page, 'viewer-floating', theme);
    });

    test('settings: controls', async ({ page }) => {
      await page.goto('/settings/controls');
      await page.locator('nc-controls-settings').waitFor();
      await page.waitForTimeout(300);
      await shoot(page, 'settings-controls', theme, page.locator('nc-controls-settings'));
    });
  });
}
