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

const ROUTES = ['/hub', '/learn', '/friends', '/sign-in', '/u/nobody'] as const;

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

  /**
   * Sign-in is what this asserts because the narrow-window notice is a state of the editor, reached
   * through the editor's own route and so behind its guard. What matters is the thing that must
   * never happen: a phone opening a link to a game being told the game does not exist.
   */
  test('a phone keeps its way into the editor, and is not 404ed out of it', async ({ page }) => {
    await page.goto('/edit/1');
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fedit%2F1/);
    await expect(page.getByRole('heading', { name: /insert game/i })).toBeVisible();
  });
});
