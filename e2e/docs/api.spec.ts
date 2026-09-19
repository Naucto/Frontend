import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { test } from '@playwright/test';

import { encodePng } from '../../tools/png';
import { mockEditor } from '../editor-mocks';

/**
 * The frames the API reference shows: one Lua file per picture, run in the editor's own viewer,
 * read back from the console's screen and written as a PNG at the console's size.
 *
 * Read from the renderer rather than shot from the page: a screenshot of the viewer is the
 * console scaled to whatever the page gave it, and a frame the docs draw pixel for pixel has to
 * be the console's own 320×180.
 */
const DEMOS = 'node_modules/.cache/docs-shots/demos';
const OUT = 'docs/api/img/frames';
const W = 320;
const H = 180;

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
    const rgba = await page.evaluate(() => {
      const screen = document.querySelector('nc-game-screen');
      if (!screen) throw new Error('no game screen');
      const { ng } = window as unknown as { ng: { getComponent(el: Element): unknown } };
      const view = ng.getComponent(screen) as { host: { screenshot(): Uint8ClampedArray | null } };
      const frame = view.host.screenshot();
      if (!frame) throw new Error('no frame');
      return Array.from(frame);
    });
    const rgb = new Uint8Array(W * H * 3);
    for (let i = 0; i < W * H; i++) {
      rgb[i * 3] = rgba[i * 4] ?? 0;
      rgb[i * 3 + 1] = rgba[i * 4 + 1] ?? 0;
      rgb[i * 3 + 2] = rgba[i * 4 + 2] ?? 0;
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${name}.png`), encodePng(W, H, rgb));
  });
}
