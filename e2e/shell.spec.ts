import { expect, test } from '@playwright/test';

test.describe('app shell', () => {
  test('hub renders with navigation and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('Naucto');
  });

  test('sign-in page shows the insert-game form', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Insert game' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await page.getByRole('button', { name: 'Make one' }).click();
    await expect(page.getByLabel('Username')).toBeVisible();
  });

  test('unknown routes show the not-found page', async ({ page }) => {
    await page.goto('/definitely-not-here');
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
  });

  test('settings redirects anonymous users to sign-in', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fsettings/);
  });
});
