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
