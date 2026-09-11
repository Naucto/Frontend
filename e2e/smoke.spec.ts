import { expect, test } from './fixtures';

test('app boots', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Naucto');
  await expect(page.locator('nc-root')).toBeAttached();
});
