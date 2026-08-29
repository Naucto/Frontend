import { expect, test } from '@playwright/test';

/**
 * The design's 1920 and 1400 frames simulate one screen size; they are not a maximum. Every
 * non-gated page has to survive from a phone to an ultrawide without the document scrolling
 * sideways — a horizontal scrollbar on the body is the single symptom that catches almost every
 * fixed width left in a layout.
 */
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'ultrawide', width: 2560, height: 1440 },
] as const;

const ROUTES = ['/hub', '/learn', '/friends', '/sign-in', '/u/nobody', '/open-on-desktop'] as const;

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} (${String(vp.width)}px)`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const route of ROUTES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await page.goto(route);
        // Wait for the shell rather than networkidle: several of these pages poll.
        await page.locator('body').waitFor();
        const overflow = await page.evaluate(() => {
          const d = document.documentElement;
          return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth };
        });
        // One pixel of slack for sub-pixel rounding on fractional scale factors.
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
      });
    }
  });
}

test.describe('editor gate', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a phone gets the open-on-desktop page, not a 404', async ({ page }) => {
    await page.goto('/edit/1');
    await expect(page).toHaveURL(/open-on-desktop/);
    await expect(page.getByRole('heading', { name: /bigger screen/i })).toBeVisible();
  });
});
