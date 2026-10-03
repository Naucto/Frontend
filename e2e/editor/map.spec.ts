import type { Page } from '@playwright/test';

import { getOptionalEnv } from '../../tools/env';
import { editorUrl, mockEditor } from '../editor-mocks';
import { expect, test } from '../fixtures';
import { boxOf, drag, lit, pansByHand } from './helpers';

test.use({ viewport: { width: 1920, height: 1030 } });

test.beforeEach(async ({ page }) => {
  await mockEditor(page);
});

/** The MAP status line is the only reading of a single tile the page offers. */
const sprUnder = async (page: Page, x: number, y: number): Promise<string> => {
  await page.mouse.move(x, y);
  const text = await page.getByText(/TILE \d+,\d+/).textContent();
  return /SPR (\d+)/.exec(text ?? '')?.[1] ?? '';
};

/**
 * Where a MAP paste lands: the middle of the well, not of the map. `boundingBox()` on the canvas
 * gives the whole map, most of which is scrolled out of sight.
 */
const wellMiddle = async (page: Page): Promise<{ x: number; y: number }> =>
  page.evaluate(() => {
    const el = document.querySelector('nc-map-canvas');
    if (!el) {
      throw new Error('no well');
    }
    const rect = el.getBoundingClientRect();
    return { x: rect.x + el.clientWidth / 2, y: rect.y + el.clientHeight / 2 };
  });

test('a middle drag pans the map by the distance the pointer moved', async ({ page }) => {
  await page.goto(editorUrl('map'));
  await expect(page.getByRole('img', { name: 'Map canvas' })).toBeVisible();
  await pansByHand(page, page.locator('nc-map-canvas'));
});

test('MAP copies a selection of tiles and pastes it as one undo step', async ({ page }) => {
  await page.goto(editorUrl('map'));
  const canvas = page.getByRole('img', { name: 'Map canvas' });
  await expect(canvas).toBeVisible();
  const box = await boxOf(canvas);

  await drag(page, box, { x: 60, y: 60 }, { x: 120, y: 100 });
  expect(await sprUnder(page, box.x + 90, box.y + 80)).not.toBe('000');

  await page.getByRole('radio', { name: 'Select' }).click();
  await drag(page, box, { x: 50, y: 50 }, { x: 130, y: 110 }, { steps: 4 });
  await page.keyboard.press('Control+c');

  // Out of the stamp's reach, so what turns up there can only be the paste.
  const target = { x: box.x + 340, y: box.y + 220 };
  expect(await sprUnder(page, target.x, target.y)).toBe('000');

  await page.keyboard.press('Control+v');
  // Placed, not written: the map is untouched until the layer is settled.
  expect(await sprUnder(page, target.x, target.y)).toBe('000');

  // Placed in the middle of the well, and the move tool is already in hand: drag it out to a
  // spot the stamp never reached, which is the only way what lands there can be the paste.
  const middle = await wellMiddle(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Enter');
  await expect.poll(() => sprUnder(page, target.x, target.y)).not.toBe('000');

  await page.keyboard.press('Control+z');
  await expect.poll(() => sprUnder(page, target.x, target.y)).toBe('000');
});

/**
 * Pasting tiles from the toolbar button, which takes the pointer off the canvas, places them away
 * from their source.
 */
test('MAP pastes from the toolbar, with no pointer on the canvas', async ({ page }) => {
  await page.goto(editorUrl('map'));
  const canvas = page.getByRole('img', { name: 'Map canvas' });
  await expect(canvas).toBeVisible();
  const box = await boxOf(canvas);

  await drag(page, box, { x: 60, y: 60 }, { x: 120, y: 100 });

  await page.getByRole('radio', { name: 'Select' }).click();
  await drag(page, box, { x: 50, y: 50 }, { x: 130, y: 110 }, { steps: 4 });

  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  await page.getByRole('button', { name: 'Paste', exact: true }).click();

  const target = { x: box.x + 340, y: box.y + 220 };
  const middle = await wellMiddle(page);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('Enter');

  await expect.poll(() => sprUnder(page, target.x, target.y)).not.toBe('000');
});

/**
 * A tile is a sprite number, so a turn moves tiles and never turns their pictures: the tile that
 * was to the right ends up below, wearing the same number.
 */
test('MAP rotates the arrangement of a selection', async ({ page }) => {
  await page.goto(editorUrl('map'));
  const canvas = page.getByRole('img', { name: 'Map canvas' });
  await expect(canvas).toBeVisible();
  const bar = page.getByRole('toolbar', { name: 'Transform the selection' });

  // A two-wide brush lays two different sprites in one press, which a rotation can be seen on.
  const picker = page.getByRole('img', { name: 'Tile picker' });
  const pick = await boxOf(picker);
  const cell = pick.width / 16;
  await drag(
    page,
    pick,
    { x: cell * 2.5, y: cell * 1.5 },
    { x: cell * 3.5, y: cell * 1.5 },
    { steps: 4 },
  );

  const box = await boxOf(canvas);
  const scale = box.width / 128;
  const at = (tx: number, ty: number): { x: number; y: number } => ({
    x: box.x + (tx + 0.5) * scale,
    y: box.y + (ty + 0.5) * scale,
  });
  /** Shadows the module helper: this one reads `SPR \d+` straight off the same line. */
  const sprUnderTile = async (tx: number, ty: number): Promise<string> => {
    const point = at(tx, ty);
    await page.mouse.move(point.x, point.y);
    // The readout follows the pointer, not the map: a nudge makes it read the tile again.
    await page.mouse.move(point.x + 1, point.y);
    const text = await page.getByText(/TILE \d+,\d+ · SPR \d+/).textContent();
    return /SPR (\d+)/.exec(text ?? '')?.[1] ?? '';
  };

  await page.mouse.click(at(2, 2).x, at(2, 2).y);
  const left = await sprUnderTile(2, 2);
  const right = await sprUnderTile(3, 2);
  expect(left).not.toBe('000');
  expect(right).not.toBe(left);
  expect(await sprUnderTile(2, 3)).toBe('000');
  await expect(bar).toHaveCount(0);

  await page.getByRole('radio', { name: 'Select' }).click();
  await page.mouse.move(at(2, 2).x, at(2, 2).y);
  await page.mouse.down();
  await page.mouse.move(at(3, 2).x, at(3, 2).y, { steps: 4 });
  await page.mouse.up();
  await expect(bar).toBeVisible();

  await bar.getByRole('button', { name: 'Rotate clockwise' }).click();
  await expect.poll(() => sprUnderTile(2, 3)).toBe(right);
  expect(await sprUnderTile(2, 2)).toBe(left);
  expect(await sprUnderTile(3, 2)).toBe('000');
  await expect(page.getByText('128 × 32 tiles')).toBeVisible();

  await page.keyboard.press('Control+z');
  await expect.poll(() => sprUnderTile(3, 2)).toBe(right);
  expect(await sprUnderTile(2, 3)).toBe('000');
});

/**
 * A running game's map.set writes a runtime layer, not the document, so the map texture -- which
 * is built from the document -- has no way to learn about it on its own.
 */
test('a map.set at runtime reaches the screen, not only the data', async ({ page }) => {
  await page.goto(editorUrl('code'));
  await expect(page.getByText('Welcome to Naucto!').first()).toBeVisible();

  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type(
    'local t = 0\nfunction _update()\nt = t + 1\nif t == 40 then map.set(0, 0, 1) end\nif t == 60 then print("TILE=" .. map.get(0, 0)) end\nend\nfunction _draw()\ngfx.clear(0)\nmap.draw(0, 0)\nend\n',
  );
  await page.getByRole('button', { name: 'Play' }).first().click();

  // Nothing on the map to start with, so the corner is the cleared colour.
  expect(await lit(page, 3, 3)).toBe(false);
  // The document took the write.
  await expect(page.getByText('TILE=1')).toBeVisible({ timeout: 10_000 });
  // And the screen has to agree with it.
  await expect.poll(() => lit(page, 3, 3), { timeout: 10_000 }).toBe(true);
});

/** A stamp from a second sheet writes that sheet's sprite number and draws its pixels. */
test('MAP stamps and draws a tile from the sheet its picker is on', async ({ page }) => {
  await page.goto(editorUrl('art'));
  const canvas = page.getByRole('img', { name: 'Sprite canvas' });
  await expect(canvas).toBeVisible();

  // A second sheet with something on its very first cell, and nothing on the first sheet's.
  await page.getByRole('button', { name: 'Add a sheet' }).click();
  await expect(page.getByRole('tab', { name: '2' })).toBeVisible();
  const box = await boxOf(canvas);
  await drag(page, box, { x: 4, y: 4 }, { x: 12, y: 12 }, { steps: 4 });
  const readout = await page
    .getByText(/SPRITE \d+/)
    .first()
    .textContent();
  const spriteNumber = Number(/\d+/.exec(readout ?? '')?.[0] ?? '0');
  expect(spriteNumber).toBeGreaterThan(0);

  await page.locator('nc-rail').getByRole('button', { name: 'Map' }).click();
  const picker = page.getByRole('img', { name: 'Tile picker' });
  await expect(picker).toBeVisible();

  // The picker starts on the first sheet, whose first cell is empty here.
  await page.getByRole('tablist', { name: 'Tilesets' }).getByRole('tab', { name: '2' }).click();

  // Choosing a sheet puts the brush back on its first cell, which is the one just painted.
  const map = page.getByRole('img', { name: 'Map canvas' });
  const box2 = await boxOf(map);
  await page.mouse.click(box2.x + 20, box2.y + 20);

  // The first sheet's first cell is blank in this project, so anything drawn here came from the
  // second — which is the whole of what this test is for.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.querySelector('nc-map-canvas canvas');
        if (!(el instanceof HTMLCanvasElement)) {
          return 0;
        }
        const ctx = el.getContext('2d');
        if (!ctx) {
          return 0;
        }
        const { data } = ctx.getImageData(0, 0, 48, 48);
        let litCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          if ((data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) > 120) {
            litCount += 1;
          }
        }
        return litCount;
      }),
    )
    .toBeGreaterThan(0);
});

test('MAP tab stamps tiles', async ({ page }) => {
  await page.goto(editorUrl('map'));
  const canvas = page.getByRole('img', { name: 'Map canvas' });
  await expect(canvas).toBeVisible();
  const box = await boxOf(canvas);
  await drag(page, box, { x: 100, y: 100 }, { x: 400, y: 160 }, { steps: 10 });
  await expect(page.getByText(/TILE \d+,\d+/)).toBeVisible();
  await page.screenshot({ path: 'test-results/v-editor-map.png' });
});

/** A second map is its own map: canvas, writes and the size dialog all follow the strip. */
test('MAP stamps on the second map and leaves the first untouched', async ({ page }) => {
  await page.goto(editorUrl('map'));
  const canvas = page.getByRole('img', { name: 'Map canvas' });
  await expect(canvas).toBeVisible();
  const maps = page.getByRole('tablist', { name: 'Maps' });

  await page.getByRole('button', { name: 'Add a map' }).click();
  await expect(maps.getByRole('tab', { name: '2' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Map #2')).toBeVisible();

  const box = await boxOf(canvas);
  await page.mouse.click(box.x + 20, box.y + 20);
  // The readout follows the pointer, not the stamp: a nudge makes it read the tile again.
  await page.mouse.move(box.x + 21, box.y + 21);
  const readout = page.getByText(/TILE \d+,\d+ · SPR \d+/);
  await expect(readout).not.toHaveText(/SPR 000/);

  await maps.getByRole('tab', { name: '1' }).click();
  await expect(page.getByText('Map #1')).toBeVisible();
  await page.mouse.move(box.x + 21, box.y + 21);
  await expect(readout).toHaveText(/SPR 000/);

  await maps.getByRole('tab', { name: '2' }).click();
  await page.mouse.move(box.x + 20, box.y + 20);
  await expect(readout).not.toHaveText(/SPR 000/);

  // Sizing the second leaves the first at what it was.
  await page.getByRole('button', { name: 'Map size' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Width' }).fill('16');
  await dialog.getByRole('textbox', { name: 'Width' }).press('Enter');
  await dialog.getByRole('textbox', { name: 'Height' }).fill('16');
  await dialog.getByRole('textbox', { name: 'Height' }).press('Enter');
  await dialog.getByRole('button', { name: 'Shrink' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('16 × 16 tiles')).toBeVisible();
  await maps.getByRole('tab', { name: '1' }).click();
  await expect(page.getByText('128 × 32 tiles')).toBeVisible();
});

/** The map number is what the runtime reads. */
test('a running game draws map 2 with map.draw(..., 2)', async ({ page }) => {
  await page.goto(editorUrl('map'));
  const canvas = page.getByRole('img', { name: 'Map canvas' });
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Add a map' }).click();
  await expect(page.getByText('Map #2')).toBeVisible();
  const box = await boxOf(canvas);
  // The first tile of the second map, so the top-left corner of the screen shows it.
  await page.mouse.click(box.x + 4, box.y + 4);
  await page.mouse.move(box.x + 5, box.y + 5);
  await expect(page.getByText(/TILE 0,0 · SPR \d+/)).not.toHaveText(/SPR 000/);

  await page.locator('nc-rail').getByRole('button', { name: 'Code' }).click();
  await expect(page.getByRole('tab', { name: 'main', exact: true })).toBeVisible();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('function _draw()\ngfx.clear(0)\nmap.draw(0, 0)\nend\n');
  await page.getByRole('button', { name: 'Play' }).first().click();
  // The first map is empty in this project: nothing at the corner.
  await expect.poll(() => lit(page, 3, 3), { timeout: 10_000 }).toBe(false);

  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('function _draw()\ngfx.clear(0)\nmap.draw(0, 0, 0, 0, 4, 4, 2)\nend\n');
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect.poll(() => lit(page, 3, 3), { timeout: 10_000 }).toBe(true);
});

test('MAP picks a brush by dragging a rectangle on the sheet', async ({ page }) => {
  await page.goto(editorUrl('map'));
  const picker = page.getByRole('img', { name: 'Tile picker' });
  await expect(picker).toBeVisible();

  const box = await boxOf(picker);
  // Half-cell offsets so each end lands inside a cell rather than on its edge. The rectangle
  // this draws is wider than it is tall, which no square brush could be.
  const cell = box.width / 16;
  await drag(
    page,
    box,
    { x: cell * 2.5, y: cell * 1.5 },
    { x: cell * 4.5, y: cell * 2.5 },
    {
      steps: 8,
    },
  );

  const map = page.getByRole('img', { name: 'Map canvas' });
  const mapBox = await boxOf(map);
  // Read a tile the press only reaches if it put down a block rather than a single sprite.
  await page.mouse.click(mapBox.x + 40, mapBox.y + 40);
  await page.mouse.move(mapBox.x + 72, mapBox.y + 40);
  await expect(page.getByText('SPR 020')).toBeVisible();
});

/**
 * Stamping the largest map at the largest zoom drops no frame; a long task is the browser's
 * dropped frame.
 */
test('MAP stamps on a 256×256 map at zoom 8 without a long task', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'longtask entries are only observed in Chromium');
  // A budget in milliseconds holds on a machine, not on a shared runner drawing through a
  // software GPU, where the same drag crosses it on the code it was written to prove.
  test.skip(
    getOptionalEnv('CI', false),
    'a frame budget is measured locally, not on a shared runner',
  );
  await page.goto(editorUrl('map'));
  const canvas = page.getByRole('img', { name: 'Map canvas' });
  await expect(canvas).toBeVisible();

  await page.getByRole('button', { name: 'Map size' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Width' }).fill('256');
  await dialog.getByRole('textbox', { name: 'Width' }).press('Enter');
  await dialog.getByRole('textbox', { name: 'Height' }).fill('256');
  await dialog.getByRole('textbox', { name: 'Height' }).press('Enter');
  await dialog.getByRole('button', { name: 'Shrink' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('256 × 256 tiles')).toBeVisible();

  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  for (let i = 0; i < 8 && !(await page.getByText('×8', { exact: true }).isVisible()); i++) {
    await zoomIn.click();
  }
  await expect(page.getByText('×8', { exact: true })).toBeVisible();

  // Only tasks of 50 ms and up are reported at all, so the list is the verdict.
  await page.evaluate(() => {
    const long: number[] = [];
    Object.assign(window, { __long: long });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        long.push(Math.round(entry.duration));
      }
    }).observe({ type: 'longtask' });
  });
  // The resize and the zoom above have their own frames to settle; they are not the stamp's.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  // Across the well, not the canvas: a canvas the size of the map starts a screenful off it.
  const well = await boxOf(page.locator('nc-map-canvas'));
  await drag(page, well, { x: 32, y: 32 }, { x: well.width - 32, y: 32 }, { steps: 20 });
  await page.mouse.move(well.x + 40, well.y + 40);
  await expect(page.getByText(/TILE \d+,\d+ · SPR \d+/)).not.toHaveText(/SPR 000/);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
  expect(long.filter((ms) => ms >= 50)).toEqual([]);
});

/** A long name truncates before the tab's buttons do. */
test('a long map name keeps its pencil and trash inside the tab', async ({ page }) => {
  await page.goto(editorUrl('map'));
  const maps = page.getByRole('tablist', { name: 'Maps' });
  await expect(maps.getByRole('tab')).toHaveCount(1);
  // A second map, or the first offers no trash.
  await page.getByRole('button', { name: 'Add a map' }).click();
  await expect(maps.getByRole('tab')).toHaveCount(2);

  const name = 'the overworld after dark';
  await maps.getByRole('tab').first().dblclick();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name' }).fill(name);
  await dialog.getByRole('button', { name: 'Save' }).click();

  const tab = maps.getByRole('tab', { name });
  await expect(tab).toBeVisible();
  await tab.hover();
  const box = await boxOf(tab);
  for (const label of ['Rename this map', 'Delete map']) {
    const button = tab.getByRole('button', { name: label });
    await expect(button).toBeVisible();
    const buttonBox = await boxOf(button);
    expect(buttonBox.x).toBeGreaterThanOrEqual(box.x);
    expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(box.x + box.width);
  }
  // Nothing in the tab runs past it: the name is what gives, and it gives before the buttons.
  expect(await tab.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const label = tab.locator('span', { hasText: name });
  expect(await label.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});

/** Both banners name their sheet or map, a nameless one by number, and follow a rename in place. */
test('each editor names what it is on, and follows a rename', async ({ page }) => {
  await page.goto(editorUrl('map'));
  await expect(page.getByText('Map #1')).toBeVisible();

  await page.locator('nc-rail').getByRole('button', { name: 'Art' }).click();
  await expect(page.getByRole('img', { name: 'Sprite canvas' })).toBeVisible();
  await expect(page.getByText('Tileset #1')).toBeVisible();

  await page.getByRole('tablist', { name: 'Sheets' }).getByRole('tab').first().dblclick();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('clouds');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Tileset clouds')).toBeVisible();
});
