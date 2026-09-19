import { readFileSync } from 'node:fs';

import { type Locator, type Page, test } from '@playwright/test';

import { mockEditor } from '../editor-mocks';
import { grabFrame, recordGif } from './frame';

/** The tutorial games the pass pictures, each seeded from its own page by `docs:shots`. */
const GAMES = ['platformer', 'first-game'] as const;
const contentOf = (game: string): string => `node_modules/.cache/docs-shots/${game}.bin`;
const OUT = 'docs/content/tutorials/img';
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

for (const game of GAMES)
  for (const theme of THEMES) {
    test.describe(`${game} tutorial (${theme})`, () => {
      test.beforeEach(async ({ page }) => {
        await mockEditor(page, { theme, content: readFileSync(contentOf(game)) });
      });

    test('art: the ground tile and its flag', async ({ page }) => {
      await page.goto('/edit/7/art');
      await page.getByRole('img', { name: 'Sprite canvas' }).waitFor();
      // To the corner first: a new game's region starts on the moon, not on sprite 0.
      const sheetMap = page.locator('nc-sheet-view svg').first();
      await sheetMap.focus();
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
      for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(500);
      await shoot(page, `${game}-art`, theme);
      await shoot(page, `${game}-flags`, theme, section(page, 'Flags'));
    });

    test('map: the level under the Flags overlay', async ({ page }) => {
      await page.goto('/edit/7/map');
      await page.getByRole('img', { name: 'Map canvas' }).waitFor();
      await page.getByRole('switch', { name: 'Flags' }).click();
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      await shoot(page, `${game}-map`, theme);
    });
  });
  }

for (const game of GAMES)
  test(`frame: ${game} as it starts`, async ({ page }) => {
    await mockEditor(page, { content: readFileSync(contentOf(game)) });
    await page.goto('/edit/7/code');
    await page.locator('nc-game-screen canvas').first().waitFor();
    await page.getByRole('button', { name: 'Play' }).first().click();
    await page.waitForTimeout(1200);
    await grabFrame(page, `${OUT}/frames/${game}.png`);
  });

test('animation: the player runs and jumps', async ({ page }) => {
  await mockEditor(page, { content: readFileSync(contentOf('platformer')) });
  await page.goto('/edit/7/code');
  await page.locator('nc-game-screen canvas').first().waitFor();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.waitForTimeout(800);
  await page.locator('nc-game-screen canvas').first().click();
  await recordGif(page, `${OUT}/frames/platformer-run.gif`, 80, async () => {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(900);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(400);
  });
});
