import { getOptionalEnv } from '../tools/env';
import { expect, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

for (const theme of ['dark', 'light'] as const) {
  test(`ui kit renders in ${theme}`, async ({ page }) => {
    await page.addInitScript((storedTheme) => {
      localStorage.setItem('naucto.theme', storedTheme);
    }, theme);
    await page.goto('/ui-kit');
    await expect(page.getByRole('heading', { name: 'Naucto UI kit' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible();
    if (!getOptionalEnv('CI', false)) {
      await page.screenshot({ path: `test-results/ui-kit-${theme}.png`, fullPage: true });
    }
  });
}

for (const [stored, marked] of [
  ['false', true],
  ['true', false],
] as const) {
  test(`the screen effect is ${marked ? 'off' : 'on'} when the preference says so`, async ({
    page,
  }) => {
    await page.addInitScript((storedVeil) => {
      localStorage.setItem('naucto.screen-veil', storedVeil);
    }, stored);
    await page.goto('/ui-kit');
    await expect(page.getByRole('heading', { name: 'Naucto UI kit' })).toBeVisible();
    // One assertion for two veils: the attribute is the only thing they share.
    const html = page.locator('html');
    if (marked) {
      await expect(html).toHaveAttribute('data-no-veil', '');
    } else {
      await expect(html).not.toHaveAttribute('data-no-veil', '');
    }
  });
}

/** Read as the computed edge role: a bevel's border is always transparent, its frame is painted. */
test('an unavailable button gains a frame only where it had one', async ({ page }) => {
  await page.goto('/ui-kit');
  const edge = async (variant: string): Promise<string> =>
    page
      .locator(`button[data-variant="${variant}"]:disabled`)
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--bv-edge'));

  expect(await edge('ghost')).toBe('rgba(0, 0, 0, 0)');
  expect(await edge('primary')).not.toBe('rgba(0, 0, 0, 0)');
});

/** One pixel is 3px: the frame, the skirt under it and the travel of a press. */
test('a raised button is drawn and pressed on the pixel grid', async ({ page }) => {
  await page.goto('/ui-kit');
  const publish = page.getByRole('button', { name: 'Publish', exact: true });
  const hero = page.getByRole('button', { name: 'hero 56' });
  const borders = (el: Element): string => getComputedStyle(el).borderWidth;

  expect(await publish.evaluate(borders)).toBe('3px 3px 6px');
  expect(await hero.evaluate(borders)).toBe('6px 6px 9px');
  expect(
    await page
      .getByRole('button', { name: 'Latched' })
      .evaluate((el) => getComputedStyle(el).translate),
  ).toBe('0px 3px');
});

/** Bands and a frame are painted, and what is painted is only there in a browser. */
test('a table stands in one frame, every other row on a band and no rule under any', async ({
  page,
}) => {
  await page.goto('/ui-kit');
  const table = page.locator('#table').getByRole('table').first();
  await expect(table.getByRole('columnheader')).toHaveText(['Action', 'Keys', 'Pad']);
  await expect(table.getByRole('rowheader').nth(1)).toContainText('Hold to jump higher');

  const rows = await table.locator('tbody tr').evaluateAll((all) =>
    all.map((row) => ({
      ground: getComputedStyle(row).backgroundColor,
      rule: getComputedStyle(row.firstElementChild ?? row).borderBottomWidth,
    })),
  );
  expect(rows).toHaveLength(4);
  expect(rows[0]?.ground).not.toBe(rows[1]?.ground);
  expect(rows[2]?.ground).toBe(rows[0]?.ground);
  expect(rows.map((row) => row.rule)).toEqual(['0px', '0px', '0px', '0px']);
  expect(await table.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('3px');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a table keeps inside the page', async ({ page }) => {
    await page.goto('/ui-kit');
    const tables = page.locator('#table').getByRole('table');
    await expect(tables).toHaveCount(2);
    for (const table of await tables.all()) {
      const box = await table.boundingBox();
      expect(box?.x).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    }
  });
});

/** The container the host reports from takes no pointer events; the row with the button must. */
test('a toast is shown from the overlay container and can be dismissed', async ({ page }) => {
  await page.goto('/ui-kit');
  await page.getByRole('button', { name: 'Toast', exact: true }).click();
  const toast = page.getByText('Saved 2 minutes ago — 942 KB');
  await expect(toast).toBeVisible();
  expect(
    await page.evaluate(
      () => document.querySelectorAll('.cdk-overlay-container nc-toast-host').length,
    ),
  ).toBe(1);

  await page.locator('nc-toast-host').getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);
});

/** A floppy's states are custom properties read by its stylesheet: only a browser sees them. */
test('a floppy opens a quarter of a shutter, raises a whole-pixel diamond and lifts under a mouse', async ({
  page,
}) => {
  await page.goto('/ui-kit');
  const open = page.getByTestId('floppy-open');
  const slide = await open.locator('.shutter').evaluate((el) => {
    return new DOMMatrix(getComputedStyle(el).transform).m41 / (el as HTMLElement).offsetWidth;
  });
  expect(slide).toBeCloseTo(0.25, 2);
  const cell = await open
    .locator('.action')
    .evaluate((el) => parseFloat(getComputedStyle(el).width) / 16);
  expect(Number.isInteger(cell)).toBe(true);

  const rest = page.getByTestId('floppy-rest').locator('nc-floppy');
  await expect(rest.locator('.action')).toHaveCSS('opacity', '0');
  await rest.hover();
  await expect(rest).toContainClass('lit');
  await expect(rest.locator('.edge')).toHaveCount(4);
  await expect(rest.locator('.action')).toHaveCSS('opacity', '1');

  await page.mouse.move(0, 0);
  await expect(rest).not.toContainClass('lit');
  await expect(rest.locator('.edge')).toHaveCount(0);
});

test('a floppy opens flat when motion is reduced', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('naucto.reduce-motion', 'true');
  });
  await page.goto('/ui-kit');
  const rest = page.getByTestId('floppy-rest').locator('nc-floppy');
  await rest.hover();
  await expect(rest.locator('.action')).toHaveCSS('opacity', '1');
  await expect(rest).not.toContainClass('lit');
});

test('taking a seat on a session disk stays on the page and lands a sticker', async ({ page }) => {
  await page.goto('/ui-kit');
  const session = page.getByTestId('floppy-session');
  await expect(session.locator('.sticker.away')).toHaveCount(1);
  await session.hover();
  await session.locator('.action').click();
  await expect(page).toHaveURL(/\/ui-kit$/);
  await expect(session.locator('.action')).toHaveCount(0);
  await expect(session.locator('.sticker.away .seat')).toHaveCount(1);
});

/**
 * The room between a glyph's box and the inner edge of the frame it stands in, the least of the
 * four sides, for every button of the ladder. A raised frame is 3px above and at the sides, and
 * 6px below with its skirt.
 */
test('a glyph keeps one pixel clear of the frame of its button, at every height', async ({
  page,
}) => {
  await page.goto('/ui-kit');
  const ladder = page.getByTestId('glyph-ladder');
  await expect(ladder).toBeVisible();
  const rooms = await ladder.locator('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const frame = button.getBoundingClientRect();
      const glyph = button.querySelector('svg')?.getBoundingClientRect();
      return glyph
        ? Math.min(
            glyph.top - frame.top - 3,
            frame.bottom - glyph.bottom - 6,
            glyph.left - frame.left - 3,
            frame.right - glyph.right - 3,
          )
        : -1;
    }),
  );

  expect(rooms).toHaveLength(12);
  expect(rooms.filter((room) => room < 3)).toEqual([]);
});
