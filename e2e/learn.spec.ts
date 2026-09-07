import { expect, test } from '@playwright/test';

test.describe('learn', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/refresh', (r) => r.fulfill({ status: 401, json: { message: 'no' } }));
    await page.route('**/projects/releases/paginated**', (r) =>
      r.fulfill({ json: { projects: [], total: 0, page: 1, limit: 48 } }),
    );
  });

  test('renders the built documentation with the tree', async ({ page }) => {
    await page.goto('/learn');
    await expect(page.getByRole('heading', { name: 'Naucto Game Engine' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Learn' })).toContainText('API reference');
  });

  test('shows API cards and resolves references', async ({ page }) => {
    await page.goto('/learn/api/gfx');
    await expect(page.locator('#gfx\\.draw_sprite')).toBeVisible();
    await expect(page.getByText('Legacy name: sprite')).toBeVisible();
  });

  test('searches functions', async ({ page }) => {
    await page.goto('/learn');
    await page.getByPlaceholder('Search the docs').fill('play_sfx');
    await expect(page.getByRole('option').first()).toContainText('sound.play_sfx');
  });

  /**
   * Both boxes used to advertise "/", and only the top bar listened for it — so the shortcut the
   * docs box showed you always put the caret somewhere else.
   */
  test('Ctrl-K focuses the docs search, and "/" still focuses the top bar', async ({ page }) => {
    await page.goto('/learn');
    const docs = page.getByPlaceholder('Search the docs');
    const global = page.getByPlaceholder('Search games, people, tags…');
    await expect(docs).toBeVisible();

    await page.keyboard.press('Control+k');
    await expect(docs).toBeFocused();

    await docs.blur();
    await page.keyboard.press('/');
    await expect(global).toBeFocused();
  });

  test('renders box art as a diagram, not a code block', async ({ page }) => {
    await page.goto('/learn/concepts/game-loop');
    await expect(page.locator('figure.doc-diagram svg')).toBeVisible();
    // and the heading that names a function keeps its inline code, at heading size
    const init = page.getByRole('heading', { name: '_init()' });
    await expect(init).toBeVisible();
    await expect(init.locator('code')).toBeVisible();
    expect(
      await init.evaluate((el) => parseFloat(getComputedStyle(el.querySelector('code')).fontSize)),
    ).toBeGreaterThan(13);
  });
});
