import { expect, test } from '@playwright/test';

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

/**
 * The sheet draws the editors' undo and redo pair three times with the second unavailable, and its
 * border stays fully transparent — only the ink drops a step. A filled button keeps a line, which
 * is how a blocked PUBLISH is drawn. So an unavailable button gains a border only where it had one.
 */
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
