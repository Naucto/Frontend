import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Locator, type Page, test } from '@playwright/test';

import { mockEditor } from '../editor-mocks';

/**
 * The pictures the network tutorials show of the app itself: the dialog `net.host` opens, and the
 * SHARED STATE table with a path declared before any run. The frames of the games are api.spec's,
 * from the staged scenes in `lua/`.
 *
 * The game behind both is the Pong tutorial's own `main.lua`, made into a document by the seed at
 * the start of the run, so the pictures cannot drift from the page they sit on.
 */
const PONG = 'docs/content/tutorials/pong/main.lua';
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

test.describe('network tutorials', () => {
  // One worker: the seed bundles itself into a cache folder it removes afterwards, so two runs at
  // once would pull the folder from under each other.
  test.describe.configure({ mode: 'serial' });

  let content: Buffer;

  test.beforeAll(() => {
    const dir = mkdtempSync(join(tmpdir(), 'tut-pong-'));
    copyFileSync(PONG, join(dir, 'pong.lua'));
    execFileSync('node', ['tools/seed-content.mjs', '--demos', dir, dir], { stdio: 'ignore' });
    content = readFileSync(join(dir, 'pong.bin'));
  });

  for (const theme of THEMES) {
    test(`pong: the Host a session dialog (${theme})`, async ({ page }) => {
      await mockEditor(page, { theme, content });
      await page.goto('/edit/7/code');
      await page.locator('nc-game-screen canvas').first().waitFor();
      await page.getByRole('button', { name: 'Play' }).first().click();
      await page.waitForTimeout(600);
      // The game reads the key as held, so it has to stay down for a frame or two.
      await page.locator('nc-game-screen canvas').first().click();
      await page.keyboard.press('h', { delay: 120 });
      const dialog = page.getByRole('dialog');
      await dialog.getByText('asked for up to 2 players').waitFor();
      await page.waitForTimeout(300);
      await shoot(page, 'pong-host-dialog', theme, dialog);
    });

    test(`permissions: SHARED STATE with winner declared (${theme})`, async ({ page }) => {
      await mockEditor(page, { theme, content });
      await page.goto('/edit/7/net');
      await page.getByRole('button', { name: 'Declare a path' }).click();
      await page.getByPlaceholder('key').fill('winner');
      await page.keyboard.press('Enter');
      const winner = page.getByRole('row').filter({ hasText: 'winner' });
      await winner.getByTitle('Clients can write this path').click();
      await page.mouse.move(0, 0);
      await page.waitForTimeout(500);
      await shoot(
        page,
        'net-shared-state-declared',
        theme,
        page.locator('nc-net-tab-page section').first(),
      );
    });
  }
});
