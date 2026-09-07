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

  /**
   * Tailwind resolves a conflict by stylesheet order, not by attribute order, so `text-ink-3 …
   * text-ink` on one element silently keeps the dim one. That is invisible in review and obvious
   * on screen, which is the worst combination — so the current page's colour is pinned here.
   */
  test('the current page nav link is drawn in ink, not the dim colour', async ({ page }) => {
    await page.goto('/hub');
    const current = page.locator('a[aria-current="page"]');
    await expect(current).toHaveText(/hub/i);

    const { active, ink, dim } = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const read = (token: string): string => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const ink = read('--color-ink');
      const dim = read('--color-ink-3');
      probe.remove();
      const el = document.querySelector('a[aria-current="page"]');
      return { active: el ? getComputedStyle(el).color : '', ink, dim };
    });

    expect(ink).not.toBe(dim);
    expect(active).toBe(ink);
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
