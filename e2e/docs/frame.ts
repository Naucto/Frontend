import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { type Page } from '@playwright/test';

import { encodePng } from '../../tools/png';

const W = 320;
const H = 180;

/**
 * Reads the console's own screen back from the renderer and writes it as a PNG at the console's
 * size. A screenshot of the viewer would be the console scaled to whatever the page gave it, and a
 * frame the docs draw pixel for pixel has to be the console's own 320×180.
 */
export async function grabFrame(page: Page, out: string): Promise<void> {
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
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(W, H, rgb));
}
