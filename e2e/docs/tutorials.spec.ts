import { readdirSync, readFileSync } from 'node:fs';

import { expect, type Locator, type Page, test } from '@playwright/test';

import { mockEditor } from '../editor-mocks';
import { grabFrame, recordGif } from './frame';

/** The tutorial games the pass pictures, each seeded from its own page by `docs:shots`. */
const GAMES = ['platformer', 'first-game'] as const;
const TUTORIALS = ['first-game', 'platformer', 'sound'] as const;
const DOCS = 'docs/content/tutorials';
const contentOf = (game: string): string => `node_modules/.cache/docs-shots/${game}.bin`;
const OUT = `${DOCS}/img`;
const THEMES = ['dark', 'light'] as const;

const titleOf = (tutorial: string): string =>
  /^title:\s*(.+)$/m.exec(readFileSync(`${DOCS}/${tutorial}.md`, 'utf8'))?.[1]?.trim() ??
  tutorial;

const stepsOf = (tutorial: string): number[] =>
  readdirSync(`${DOCS}/${tutorial}/steps`)
    .filter((f) => f.endsWith('.lua'))
    .map((f) => Number(f.replace('.lua', '')))
    .sort((a, b) => a - b);

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

/**
 * Walks a sheet map's region to sprite 32, the first cell of the third row: to the corner first,
 * since a new game's region starts on the moon, not on sprite 0.
 */
const pickSprite32 = async (page: Page, sheetMap: Locator): Promise<void> => {
  await sheetMap.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
};

const hold = async (page: Page, key: string, ms: number): Promise<void> => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};

const holdBoth = async (page: Page, a: string, b: string, ms: number): Promise<void> => {
  await page.keyboard.down(a);
  await page.keyboard.down(b);
  await page.waitForTimeout(ms);
  await page.keyboard.up(a);
  await page.keyboard.up(b);
};

/**
 * Plays the game of one step of a tutorial and keeps its frame under the page. `act` drives the
 * game to the moment the picture is of; without one the frame is what a reader sees a second
 * after Play. A game that halts is a step file that does not run, which no picture may hide.
 */
async function stepFrame(
  page: Page,
  tutorial: string,
  step: number,
  act: (page: Page) => Promise<void> = (p) => p.waitForTimeout(1200),
): Promise<void> {
  await mockEditor(page, {
    content: readFileSync(contentOf(`${tutorial}-step${String(step)}`)),
    name: titleOf(tutorial),
  });
  await page.goto('/edit/7/code');
  await page.locator('nc-game-screen canvas').first().waitFor();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await act(page);
  await expect(page.getByText('--- HALTED ---')).toHaveCount(0);
  const state = await page.evaluate(() => {
    const screen = document.querySelector('nc-game-screen');
    if (!screen) throw new Error('no game screen');
    const { ng } = window as unknown as { ng: { getComponent(el: Element): unknown } };
    const view = ng.getComponent(screen) as { host: { state(): string } };
    return view.host.state();
  });
  expect(state, `${tutorial} step ${String(step)} runtime state`).not.toBe('halted');
  await grabFrame(page, `${OUT}/frames/${tutorial}-step${String(step)}.png`);
}

for (const game of GAMES)
  for (const theme of THEMES) {
    test.describe(`${game} tutorial (${theme})`, () => {
      test.beforeEach(async ({ page }) => {
        await mockEditor(page, {
          theme,
          content: readFileSync(contentOf(game)),
          name: titleOf(game),
        });
      });

      test('art: the ground tile and its flag', async ({ page }) => {
        await page.goto('/edit/7/art');
        await page.getByRole('img', { name: 'Sprite canvas' }).waitFor();
        await pickSprite32(page, page.locator('nc-sheet-view svg').first());
        await page.waitForTimeout(500);
        await shoot(page, `${game}-art`, theme);
        await shoot(page, `${game}-flags`, theme, section(page, 'Flags'));
      });

      test('map: the level under the Flags overlay', async ({ page }) => {
        await page.goto('/edit/7/map');
        await page.getByRole('img', { name: 'Map canvas' }).waitFor();
        await page.getByRole('switch', { name: 'Flags' }).click();
        await pickSprite32(page, page.locator('nc-sheet-view svg').first());
        await page.mouse.move(0, 0);
        await page.waitForTimeout(500);
        await shoot(page, `${game}-map`, theme);
      });
    });
  }

for (const game of GAMES)
  test(`frame: ${game} as it starts`, async ({ page }) => {
    await mockEditor(page, { content: readFileSync(contentOf(game)), name: titleOf(game) });
    await page.goto('/edit/7/code');
    await page.locator('nc-game-screen canvas').first().waitFor();
    await page.getByRole('button', { name: 'Play' }).first().click();
    await page.waitForTimeout(1200);
    await grabFrame(page, `${OUT}/frames/${game}.png`);
  });

test('animation: the player runs and jumps', async ({ page }) => {
  await mockEditor(page, {
    content: readFileSync(contentOf('platformer')),
    name: titleOf('platformer'),
  });
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

/**
 * The steps whose picture is of a moment the reader has to play to, rather than the first
 * second: each drives the keyboard to it. The coin hunt's room is known from its assets file, so
 * the route below is written in walls and holds: a wall stops the player at a known pixel, and a
 * hold from there is a known distance, within the seven pixels a coin overlaps at.
 */
const STAGED: Record<string, Record<number, (page: Page) => Promise<void>>> = {
  'first-game': {
    4: async (page) => {
      await page.waitForTimeout(300);
      await holdBoth(page, 'ArrowUp', 'ArrowLeft', 300);
      await hold(page, 'ArrowDown', 133);
      await hold(page, 'ArrowRight', 400);
      await page.waitForTimeout(300);
    },
    5: async (page) => {
      await page.waitForTimeout(300);
      await holdBoth(page, 'ArrowUp', 'ArrowLeft', 300);
      await hold(page, 'ArrowDown', 133);
      await hold(page, 'ArrowRight', 2700);
      await hold(page, 'ArrowUp', 300);
      await hold(page, 'ArrowLeft', 2700);
      await hold(page, 'ArrowDown', 667);
      await hold(page, 'ArrowRight', 1500);
      await hold(page, 'ArrowUp', 1000);
      await hold(page, 'ArrowRight', 2000);
      await hold(page, 'ArrowDown', 2000);
      await hold(page, 'ArrowUp', 467);
      await hold(page, 'ArrowLeft', 1500);
      await hold(page, 'ArrowDown', 1000);
      await hold(page, 'ArrowLeft', 2000);
      await hold(page, 'ArrowUp', 83);
      await hold(page, 'ArrowRight', 600);
      await page.waitForTimeout(300);
    },
  },
  platformer: {
    // Still falling: a second later the player is off the bottom of the screen.
    4: (page) => page.waitForTimeout(350),
    // Into the spikes and back to the start, as a GIF: the trophy is off screen until Step 7
    // brings the camera, so the deadly tile is the one with a picture in it.
    6: async (page) => {
      await page.waitForTimeout(700);
      await recordGif(page, `${OUT}/frames/platformer-step6.gif`, 80, async () => {
        await hold(page, 'ArrowRight', 1000);
        await page.waitForTimeout(900);
      });
    },
  },
};

for (const tutorial of TUTORIALS)
  for (const step of stepsOf(tutorial))
    test(`frame: ${tutorial} at the end of step ${String(step)}`, async ({ page }) => {
      await stepFrame(page, tutorial, step, STAGED[tutorial]?.[step]);
    });

for (const theme of THEMES)
  test(`sound: the panels the tutorial visits (${theme})`, async ({ page }) => {
    await mockEditor(page, {
      theme,
      content: readFileSync(contentOf('sound-step5')),
      name: titleOf('sound'),
    });
    await page.goto('/edit/7/sound');
    await page.getByRole('img', { name: 'Piano roll' }).waitFor();
    await page.waitForTimeout(500);
    await shoot(page, 'sound-roll-pattern', theme, page.locator('nc-piano-roll'));
    await shoot(page, 'sound-music-chain', theme, page.locator('nc-song-list'));
    const pattern = page.getByRole('textbox', { name: /^pattern$/i });
    await pattern.fill('2');
    await pattern.press('Enter');
    await page.waitForTimeout(300);
    await shoot(page, 'sound-sfx-slot', theme, page.locator('nc-slot-grid').first());
    await page.getByRole('button', { name: 'Add instrument' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New instrument' });
    await dialog.getByRole('button', { name: 'From a preset' }).click();
    await dialog.getByRole('tab', { name: 'Lead' }).click();
    await dialog.getByRole('radio', { name: 'Square lead' }).click();
    await page.waitForTimeout(200);
    await shoot(page, 'sound-presets-lead', theme, dialog);
    await page.keyboard.press('Escape');
  });
