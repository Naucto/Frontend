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
