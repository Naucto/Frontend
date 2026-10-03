import type { Page } from '@playwright/test';

import { editorUrl, mockEditor } from '../editor-mocks';
import { expect, test } from '../fixtures';
import { boxOf, drag, pansByHand, screenPixels } from './helpers';

test.use({ viewport: { width: 1920, height: 1030 } });

test.beforeEach(async ({ page }) => {
  await mockEditor(page);
});

/** How much art the sheet holds, as the count of opaque pixels its navigator draws. */
async function inked(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('nc-sheet-view canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return -1;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return -1;
    }
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] !== 0) {
        count += 1;
      }
    }
    return count;
  });
}

test('ART tab gives the canvas the console’s width, and paints with the pen', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(canvas).toBeVisible();

  // The console is CODE's own sidebar: on a canvas tab there is nothing to unfold.
  await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
  await expect(page.getByText('Viewer · 320×180')).toHaveCount(0);

  // Lock off, or the lock clips the stroke to the single sprite in hand.
  await expect(page.getByRole('switch', { name: 'Lock' })).toHaveAttribute('aria-checked', 'false');

  // Drawn before the viewer is floated, because the pip lands over the canvas and would take
  // the stroke instead.
  const before = await inked(page);
  const box = await boxOf(canvas);
  await drag(page, box, { x: 40, y: 40 }, { x: 300, y: 200 }, { steps: 10 });
  await expect.poll(() => inked(page)).not.toBe(before);

  // The viewer is floated from the console's own header, so it is opened where the console is,
  // and ART is reached through the rail: a fresh page load opens the editor docked.
  await page.goto(editorUrl('code'));
  await page.getByRole('button', { name: 'Pop the viewer out' }).click();
  await page.locator('nc-rail').getByRole('button', { name: 'Art' }).click();
  await expect(page.getByText('Viewer · 320×180')).toBeVisible();

  // Over the canvas, not over the inspector: the corner the artboard draws the card in is the
  // console's, and on a canvas tab that track holds the panel you came to work in.
  const card = await boxOf(page.locator('.nc-pip'));
  const panel = await boxOf(page.locator('nc-panel-column').first());
  expect(card.x + card.width).toBeLessThanOrEqual(panel.x);

  await page.screenshot({ path: 'test-results/v-editor-art.png' });
});

/**
 * Cropped, the canvas is the region, so every coordinate in it carries the region's origin. A
 * stroke that lands on the wrong pixels looks right while it happens and paints out of sight.
 */
test('ART paints the pixel under the pointer while cropped', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(canvas).toBeVisible();

  await page.getByRole('switch', { name: /crop/i }).click();
  // Away from the sheet's origin, so an unoffset coordinate would miss.
  await page.getByRole('img', { name: /Sheet map/ }).click({ position: { x: 130, y: 90 } });

  const before = await inked(page);
  const box = await boxOf(canvas);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => inked(page)).not.toBe(before);
});

/**
 * Onion ghosts the frame before this one underneath it. Uncropped, that frame is already on
 * screen beside the current one, so the control has nothing to offer and is not drawn.
 */
test('ONION is offered only where the sheet is cropped away', async ({ page }) => {
  await page.goto(editorUrl('art'));
  await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();

  const onion = page.getByRole('switch', { name: /Onion/ });
  await expect(onion).toHaveCount(0);

  await page.getByRole('switch', { name: /Crop/ }).click();
  await expect(onion).toBeVisible();
});

test('a middle drag pans the sheet by the distance the pointer moved', async ({ page }) => {
  await page.goto(editorUrl('art'));
  await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();
  await pansByHand(page, page.locator('nc-sprite-canvas'));
});

/** Read as a fraction of the content, which is the thing a zoom changes the size of. */
test('zooming the sheet keeps what was in the middle', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const well = page.locator('nc-sprite-canvas');
  await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();

  // Far enough in that the sheet overflows the well, and away from the middle so holding it means
  // something.
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
  }
  await well.evaluate((el) => {
    el.scrollLeft = el.scrollWidth * 0.7;
    el.scrollTop = el.scrollHeight * 0.7;
  });

  const middle = async (): Promise<number> =>
    well.evaluate((el) =>
      Math.round(((el.scrollLeft + el.clientWidth / 2) / el.scrollWidth) * 100),
    );
  const before = await middle();
  await page.getByRole('button', { name: 'Zoom in' }).click();

  await expect.poll(middle).toBe(before);
});

test('the sheet map follows a zoom, not only a scroll', async ({ page }) => {
  await page.goto(editorUrl('art'));
  await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();

  // The dashed view frame's area, read from its geometry: the only mark on the map a zoom moves.
  const frame = page.locator('nc-sheet-view rect[stroke-dasharray]');
  const area = async (): Promise<number> =>
    Number(await frame.getAttribute('width')) * Number(await frame.getAttribute('height'));

  const before = await area();
  expect(before).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  // In, so it shows less of the sheet, so the frame covers less of the map.
  await expect.poll(area).toBeLessThan(before);
});

/** A paste that merged with the stroke before it would take both back at once. */
test('ART copies a selection and pastes it as one undo step', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(canvas).toBeVisible();

  // Off, or the paste below is clipped to the sprite in hand: the lock stops a paste where it
  // stops a stroke.
  await expect(page.getByRole('switch', { name: 'Lock' })).toHaveAttribute('aria-checked', 'false');

  const box = await boxOf(canvas);
  await drag(page, box, { x: 40, y: 40 }, { x: 90, y: 90 });
  const painted = await inked(page);

  await page.getByRole('radio', { name: 'Select' }).click();
  await drag(page, box, { x: 30, y: 30 }, { x: 100, y: 100 }, { steps: 4 });
  await page.keyboard.press('Control+c');

  await page.mouse.move(box.x + 200, box.y + 160);
  await page.keyboard.press('Control+v');
  // Placed, not written: what it covers is still underneath until it is settled.
  await expect.poll(() => inked(page)).toBe(painted);

  await page.keyboard.press('Enter');
  await expect.poll(() => inked(page)).not.toBe(painted);
  const pasted = await inked(page);

  await page.keyboard.press('Control+z');
  await expect.poll(() => inked(page)).toBe(painted);
  expect(pasted).not.toBe(painted);
});

/**
 * Pasting from the toolbar button, which takes the pointer off the canvas, lands the paste away
 * from its source.
 */
test('ART pastes from the toolbar, with no pointer on the canvas', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(canvas).toBeVisible();

  const box = await boxOf(canvas);
  await drag(page, box, { x: 40, y: 40 }, { x: 90, y: 90 });

  await page.getByRole('radio', { name: 'Select' }).click();
  await drag(page, box, { x: 30, y: 30 }, { x: 100, y: 100 }, { steps: 4 });
  const painted = await inked(page);

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await expect.poll(() => inked(page)).toBe(painted);

  await page.keyboard.press('Enter');
  await expect.poll(() => inked(page)).not.toBe(painted);
});

test('ART throws a placed paste away on Escape, leaving nothing to undo', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(canvas).toBeVisible();

  const box = await boxOf(canvas);
  await drag(page, box, { x: 40, y: 40 }, { x: 90, y: 90 });
  const painted = await inked(page);

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => inked(page)).toBe(painted);

  // Nothing was written, so the undo reaches past the paste to the stroke before it.
  await page.keyboard.press('Control+z');
  await expect.poll(() => inked(page)).not.toBe(painted);
});

test('ART flips a selection horizontally as one undo step', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(canvas).toBeVisible();
  const box = await boxOf(canvas);
  const bar = page.getByRole('toolbar', { name: 'Transform the selection' });

  /** The centre of a sheet pixel: the canvas is the whole sheet, drawn at a whole scale. */
  const scale = box.width / 128;
  const at = (cx: number, cy: number): { x: number; y: number } => ({
    x: box.x + (cx + 0.5) * scale,
    y: box.y + (cy + 0.5) * scale,
  });
  /** The status line is the only reading of a single pixel the page offers. */
  const colUnder = async (cx: number, cy: number): Promise<string> => {
    const point = at(cx, cy);
    await page.mouse.move(point.x, point.y);
    // The readout follows the pointer, not the sheet: a nudge makes it read the pixel again.
    await page.mouse.move(point.x + 1, point.y);
    const text = await page.getByText(/X \d+ Y \d+/).textContent();
    return /COL (\d+)/.exec(text ?? '')?.[1] ?? '';
  };

  // Two pixels on the left of a 4×2 region, so a flip has somewhere to send them.
  await page.mouse.click(at(2, 4).x, at(2, 4).y);
  await page.mouse.click(at(3, 4).x, at(3, 4).y);
  expect(await colUnder(2, 4)).not.toBe('00');
  expect(await colUnder(5, 4)).toBe('00');
  await expect(bar).toHaveCount(0);

  await page.getByRole('radio', { name: 'Select' }).click();
  await page.mouse.move(at(2, 4).x, at(2, 4).y);
  await page.mouse.down();
  await page.mouse.move(at(5, 5).x, at(5, 5).y, { steps: 4 });
  await page.mouse.up();
  await expect(bar).toBeVisible();

  await bar.getByRole('button', { name: 'Flip horizontally' }).click();
  await expect.poll(() => colUnder(5, 4)).not.toBe('00');
  expect(await colUnder(4, 4)).not.toBe('00');
  expect(await colUnder(2, 4)).toBe('00');

  await page.keyboard.press('Control+z');
  await expect.poll(() => colUnder(2, 4)).not.toBe('00');
  expect(await colUnder(5, 4)).toBe('00');
});

/**
 * A sprite on a second sheet draws in the game; tabs change through the rail because the added
 * sheet is never saved.
 */
test('a running game draws a sprite from the second sheet', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(canvas).toBeVisible();

  await page.getByRole('button', { name: 'Add a sheet' }).click();
  // Nameless, so it answers to its number.
  await expect(page.getByRole('tab', { name: '2' })).toBeVisible();
  const box = await boxOf(canvas);
  await drag(page, box, { x: 4, y: 4 }, { x: 12, y: 12 }, { steps: 4 });

  // The first cell of the new sheet, which is the number the code below names.
  const readout = await page
    .getByText(/SPRITE \d+/)
    .first()
    .textContent();
  const spriteNumber = Number(/\d+/.exec(readout ?? '')?.[0] ?? '0');
  expect(spriteNumber).toBeGreaterThan(0);

  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(
    `function _draw()\ngfx.clear(0)\ngfx.draw_sprite(${String(spriteNumber)}, 0, 0)\nend\n`,
  );
  await page.getByRole('button', { name: 'Play' }).first().click();

  await expect
    .poll(
      async () => {
        const data = await screenPixels(page, 0, 0, 8, 8);
        for (let i = 0; i < data.length; i += 3) {
          if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 120) {
            return true;
          }
        }
        return false;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
});

/**
 * The size of a sheet moves every sprite number in the game and rewrites the calls that named
 * one, so it sits behind a door rather than on a caret in the strip — and the door says what it
 * is about to cost while the numbers are still being chosen.
 */
test('the sheet size is chosen in a dialog that says what it will move', async ({ page }) => {
  await page.goto(editorUrl('art'));
  await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();
  // No size in the strip: adding a sheet and resizing one are not the same weight.
  await expect(page.getByRole('tablist', { name: 'Sheets' }).getByRole('spinbutton')).toHaveCount(
    0,
  );

  await page.getByRole('button', { name: 'Sheet size' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const width = dialog.getByRole('textbox', { name: 'Width' });
  await expect(width).toHaveValue('128');
  await expect(dialog.getByRole('button', { name: 'Renumber' })).toBeDisabled();

  await width.fill('192');
  await width.press('Enter');
  // Widening re-flows the grid, so the calls that named a sprite are counted before it happens.
  await expect(dialog.getByText(/calls in your code/)).toBeVisible();

  await dialog.getByRole('button', { name: 'Renumber' }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'Sheet size' }).click();
  const again = page.getByRole('dialog');
  await expect(again.getByRole('textbox', { name: 'Width' })).toHaveValue('192');

  // What is lost is said apart from what merely moves: last of the lines, right above the
  // buttons, and whole.
  await again.getByRole('textbox', { name: 'Width' }).fill('64');
  await again.getByRole('textbox', { name: 'Width' }).press('Enter');
  // Narrower re-flows the grid, shorter drops the row the lower half of the moon is drawn on:
  // one change that moves things and one that loses them, which is the pair being told apart.
  await again.getByRole('textbox', { name: 'Height' }).fill('8');
  await again.getByRole('textbox', { name: 'Height' }).press('Enter');
  const loss = again.getByText(/fall outside a sheet that size/);
  const moved = again.getByText(/calls in your code/);
  await expect(loss).toBeVisible();
  const lossBox = await loss.boundingBox();
  const movedBox = await moved.boundingBox();
  const buttons = await again.getByRole('button', { name: 'Renumber' }).boundingBox();
  expect(lossBox && movedBox && buttons).toBeTruthy();
  if (!lossBox || !movedBox || !buttons) {
    return;
  }
  expect(lossBox.y).toBeGreaterThan(movedBox.y);
  expect(lossBox.y + lossBox.height).toBeLessThanOrEqual(buttons.y);
  // Whole: it is the one line here that cannot be taken back, so the box grows to hold it
  // rather than cutting it short at the edge.
  expect(await loss.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(lossBox.height).toBeGreaterThan(24);
});

/** An overflowing strip stays reachable to a pointer with no horizontal wheel. */
test('a strip that runs past its edge can be walked with arrows', async ({ page }) => {
  await page.goto(editorUrl('art'));
  await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();

  const strip = page.getByRole('tablist', { name: 'Sheets' });
  const later = page.getByRole('button', { name: 'Later tabs' });
  await expect(later).toHaveCount(0);

  // Enough to run past the edge with room to spare -- a nameless tab is barely wider than its
  // number -- and no more: every sheet added is a document write the whole page reacts to.
  const add = page.getByRole('button', { name: 'Add a sheet' });
  for (let i = 0; i < 16; i++) {
    await add.click();
  }

  // Back to the first sheet before looking: each new one is selected and scrolled to, so the
  // strip ends up at its far end, where the only way left to go is back.
  await page.getByRole('tab').first().click();
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
  await expect(later).toBeVisible();

  await later.click();
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'Earlier tabs' })).toBeVisible();
});

/**
 * The navigator takes its given width at the sheet's proportions, so a cell is square whatever the
 * sheet's shape.
 */
test('the sheet navigator fits its panel and keeps its tiles square', async ({ page }) => {
  await page.goto(editorUrl('art'));
  await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();
  const view = page.locator('nc-sheet-view');

  const resize = async (width: string, height: string): Promise<void> => {
    await page.getByRole('button', { name: 'Sheet size' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Width' }).fill(width);
    await dialog.getByRole('textbox', { name: 'Height' }).fill(height);
    await dialog.getByRole('textbox', { name: 'Height' }).press('Enter');
    await dialog.getByRole('button', { name: 'Renumber' }).click();
    await expect(dialog).toHaveCount(0);
  };

  // Four times as wide as it is tall: the box has to be too, or the cells are not squares.
  await resize('256', '64');
  await expect.poll(async () => (await view.boundingBox())?.height).toBeLessThan(200);
  const wide = await view.boundingBox();
  expect(wide).not.toBeNull();
  if (!wide) {
    return;
  }
  expect(wide.width / wide.height).toBeCloseTo(4, 1);

  // And the other way up, where the height is what runs out first.
  await resize('64', '256');
  await expect.poll(async () => (await view.boundingBox())?.width).toBeLessThan(200);
  const tall = await view.boundingBox();
  expect(tall).not.toBeNull();
  if (!tall) {
    return;
  }
  expect(tall.height / tall.width).toBeCloseTo(4, 1);
  expect(tall.height).toBeLessThanOrEqual(384);
});
