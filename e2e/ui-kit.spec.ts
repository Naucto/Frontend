import { expect, test } from './fixtures';

test.describe.configure({ mode: 'serial' });

for (const theme of ['dark', 'light'] as const) {
  test(`ui kit renders in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('naucto.theme', t);
    }, theme);
    await page.goto('/ui-kit');
    await expect(page.getByRole('heading', { name: 'Naucto UI kit' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible();
    if (!process.env.CI) {
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
    await page.addInitScript((v) => {
      localStorage.setItem('naucto.screen-veil', v);
    }, stored);
    await page.goto('/ui-kit');
    await expect(page.getByRole('heading', { name: 'Naucto UI kit' })).toBeVisible();
    // One assertion for two veils: the attribute is the only thing they share.
    const html = page.locator('html');
    if (marked) await expect(html).toHaveAttribute('data-no-veil', '');
    else await expect(html).not.toHaveAttribute('data-no-veil', '');
  });
}

/** Read as a computed colour, because the border is always there and only its alpha carries this. */
test('an unavailable button gains a border only where it had one', async ({ page }) => {
  await page.goto('/ui-kit');
  const border = async (variant: string): Promise<string> =>
    page
      .locator(`button[data-variant="${variant}"]:disabled`)
      .first()
      .evaluate((el) => getComputedStyle(el).borderTopColor);

  expect(await border('ghost')).toBe('rgba(0, 0, 0, 0)');
  expect(await border('primary')).not.toBe('rgba(0, 0, 0, 0)');
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

  await page.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toHaveCount(0);
});
