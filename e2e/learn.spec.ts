import { expect, test } from './fixtures';

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
    await expect(page.getByText('Legacy name')).toHaveCount(0);
    await expect(
      page.locator('#gfx\\.draw_sprite').getByRole('button', { name: 'gfx.draw_region' }),
    ).toBeVisible();
  });

  /**
   * The tree opens the page being read: a page of cards lists its functions, a page of prose its
   * sections, and either is one click from the place itself.
   */
  test('the tree unfolds the open page into its functions or its sections', async ({ page }) => {
    await page.goto('/learn/api/gfx');
    const tree = page.getByRole('navigation', { name: 'Learn' });
    const clear = tree.getByRole('button', { name: 'clear', exact: true });
    await expect(clear).toBeVisible();
    await clear.click();
    await expect(page).toHaveURL(/#gfx\.clear$/);
    await expect(clear).toHaveAttribute('aria-current', 'location');
    await expect(page.locator('#gfx\\.clear')).toBeInViewport();
    // Another page folds this one back up and unfolds its own sections.
    await tree.getByRole('button', { name: 'Build Multiplayer Pong' }).click();
    await expect(clear).toBeHidden();
    await expect(tree.getByRole('button', { name: 'Step 1: Four states' })).toBeVisible();
  });

  test('a tutorial counts its steps and offers its finished game', async ({ page }) => {
    await page.goto('/learn/tutorials/pong');
    const steps = page.locator('h2[data-step]');
    await expect(steps).toHaveCount(6);
    await expect(steps.first()).toHaveAttribute('data-steps', '6');
    await expect(page.getByRole('button', { name: 'Copy to new game' })).toBeVisible();
  });

  test('searches functions', async ({ page }) => {
    await page.goto('/learn');
    await page.getByPlaceholder('Search', { exact: true }).fill('play_sfx');
    await expect(page.getByRole('option').first()).toContainText('sound.play_sfx');
  });

  test('ranks a name over a mention, and lands a page hit on its section', async ({ page }) => {
    await page.goto('/learn');
    const search = page.getByPlaceholder('Search', { exact: true });
    await search.fill('camera');
    await expect(page.getByRole('option').first()).toContainText('gfx.camera');

    await search.fill('heavier one every eight');
    const hit = page.getByRole('option').first();
    await expect(hit).toContainText('MAP');
    await expect(hit).toContainText('Grid and Flags');
    await hit.click();
    await expect(page).toHaveURL(/\/learn\/editors\/map#grid-and-flags$/);
    await expect(page.locator('#grid-and-flags')).toBeInViewport();
  });

  test('the tree unfolds the sub-sections of the section being read, and keeps its folds', async ({
    page,
  }) => {
    await page.goto('/learn/tutorials/platformer#draw-the-seven-sprites');
    const tree = page.getByRole('navigation', { name: 'Learn' });
    await expect(tree.getByRole('button', { name: 'Draw the seven sprites' })).toBeVisible();
    await expect(tree.getByRole('button', { name: 'Input', exact: true })).toHaveCount(0);

    await tree.getByRole('button', { name: 'API reference' }).click();
    await expect(tree.getByRole('button', { name: 'Rendering', exact: true })).toBeHidden();
    await page.reload();
    await expect(tree.getByRole('button', { name: 'Build a Platformer Game' })).toBeVisible();
    await expect(tree.getByRole('button', { name: 'Rendering', exact: true })).toBeHidden();
  });

  /**
   * Both boxes used to advertise "/", and only the top bar listened for it — so the shortcut the
   * docs box showed you always put the caret somewhere else.
   */
  test('Ctrl-K focuses the docs search, and "/" still focuses the top bar', async ({ page }) => {
    await page.goto('/learn');
    const docs = page.getByPlaceholder('Search', { exact: true });
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
