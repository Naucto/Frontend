import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { type Page } from '@playwright/test';

import { encodeGif } from '../../tools/gif';
import { encodePng } from '../../tools/png';

const W = 320;
const H = 180;

const toRgb = (rgba: ArrayLike<number>): Uint8Array => {
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    rgb[i * 3] = rgba[i * 4] ?? 0;
    rgb[i * 3 + 1] = rgba[i * 4 + 1] ?? 0;
    rgb[i * 3 + 2] = rgba[i * 4 + 2] ?? 0;
  }
  return rgb;
};

const write = (out: string, bytes: Uint8Array): void => {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
};

/** The console's own pixels, read from the renderer: a page screenshot would be them rescaled. */
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
  write(out, encodePng(W, H, toRgb(rgba)));
}

/**
 * Records the console every `everyMs` while `act` plays the game, then writes the frames as a
 * looping GIF. The frames are kept in the page and fetched once, base64 packed: a round trip per
 * frame would miss the ones drawn while it travelled.
 */
export async function recordGif(
  page: Page,
  out: string,
  everyMs: number,
  act: () => Promise<void>,
): Promise<void> {
  await page.evaluate((every) => {
    const screen = document.querySelector('nc-game-screen');
    if (!screen) throw new Error('no game screen');
    const { ng } = window as unknown as { ng: { getComponent(el: Element): unknown } };
    const view = ng.getComponent(screen) as { host: { screenshot(): Uint8ClampedArray | null } };
    const frames: string[] = [];
    const timer = setInterval(() => {
      const frame = view.host.screenshot();
      if (!frame) return;
      let s = '';
      for (let i = 0; i < frame.length; i += 0x8000)
        s += String.fromCharCode(...frame.subarray(i, i + 0x8000));
      frames.push(btoa(s));
    }, every);
    (window as unknown as { __rec: { frames: string[]; timer: number } }).__rec = {
      frames,
      timer: timer as unknown as number,
    };
  }, everyMs);
  await act();
  const packed = await page.evaluate(() => {
    const rec = (window as unknown as { __rec: { frames: string[]; timer: number } }).__rec;
    clearInterval(rec.timer);
    return rec.frames;
  });
  const frames = packed.map((b64) => toRgb(Buffer.from(b64, 'base64')));
  write(out, encodeGif(W, H, frames, everyMs));
}
