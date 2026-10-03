import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { SCREEN_WIDTH } from '../../packages/engine/src/game/keys';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A locator's box, or a thrown error — every drag below needs real geometry to work from. */
export async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('not laid out');
  }
  return box;
}

/**
 * A pointer drag from one point of `box` to another, both given as an offset from its corner.
 * Mirrors the editor's own gesture: move, press, move in steps, release.
 */
export async function drag(
  page: Page,
  box: Box,
  from: { x: number; y: number },
  to: { x: number; y: number },
  { steps = 6, button = 'left' }: { steps?: number; button?: 'left' | 'middle' | 'right' } = {},
): Promise<void> {
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down({ button });
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps });
  await page.mouse.up({ button });
}

/**
 * The middle button drags the view by exactly the pointer's own distance, on both surfaces
 * that scroll: pixel for pixel, with nothing snapped to a cell or a tile on the way.
 */
export async function pansByHand(page: Page, well: Locator): Promise<void> {
  // Zoomed in until there is room to move both ways, then put somewhere in the middle: a zoom
  // lands the view wherever it keeps its centre, which is nowhere a delta can be read from.
  const room = (): Promise<number> =>
    well.evaluate((el) =>
      Math.min(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight),
    );
  for (let i = 0; i < 8 && (await room()) < 400; i++) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
  }
  expect(await room()).toBeGreaterThanOrEqual(400);
  // After the frame the zoom lays the view out in, which is when it writes its own offsets.
  await page.evaluate(
    () =>
      new Promise((done) => {
        requestAnimationFrame(() => requestAnimationFrame(done));
      }),
  );
  await well.evaluate((el) => {
    el.scrollLeft = 200;
    el.scrollTop = 150;
  });
  await expect.poll(() => well.evaluate((el) => el.scrollLeft)).toBe(200);
  const box = await boxOf(well);
  const centre = { x: box.width / 2, y: box.height / 2 };
  await drag(page, box, centre, { x: centre.x - 120, y: centre.y - 80 }, { button: 'middle' });
  await expect.poll(() => well.evaluate((el) => el.scrollLeft)).toBe(320);
  await expect.poll(() => well.evaluate((el) => el.scrollTop)).toBe(230);
}

/**
 * The RGB of a rectangle of the last presented frame, re-presented through the engine because the
 * canvas buffer is not kept past compositing.
 */
export async function screenPixels(
  page: Page,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<number[]> {
  return page.evaluate(
    (rect: { x: number; y: number; w: number; h: number; screenWidth: number }) => {
      const screen = document.querySelector('nc-game-screen');
      if (!screen) {
        throw new Error('no game screen');
      }
      const { ng } = window as unknown as { ng: { getComponent(el: Element): unknown } };
      const view = ng.getComponent(screen) as {
        host: { screenshot(): Uint8ClampedArray | null };
      } | null;
      const rgba = view?.host.screenshot();
      if (!rgba) {
        throw new Error('no frame');
      }
      const out: number[] = [];
      for (let j = 0; j < rect.h; j++) {
        for (let i = 0; i < rect.w; i++) {
          const offset = ((rect.y + j) * rect.screenWidth + rect.x + i) * 4;
          out.push(rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0);
        }
      }
      return out;
    },
    { x, y, w: width, h: height, screenWidth: SCREEN_WIDTH },
  );
}

/** Whether the screen pixel at (x, y) is brighter than the cleared background. */
export async function lit(page: Page, x: number, y: number): Promise<boolean> {
  const [red = 0, green = 0, blue = 0] = await screenPixels(page, x, y, 1, 1);
  return red + green + blue > 120;
}
