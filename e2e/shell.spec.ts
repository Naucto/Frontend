import { expect, test } from './fixtures';
import { release } from './mocks/game';

test.describe('app shell', () => {
  test('hub renders with navigation and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('A browser fantasy console');
  });

  test('sign-in page shows the insert-game form', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Insert game' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await page.getByRole('button', { name: 'Make one' }).click();
    await expect(page.getByLabel('Username')).toBeVisible();
  });

  /**
   * The numbers differ from the backend's real policy on purpose, so a rule hard-coded in the form
   * fails here.
   */
  test('the password field states the rule the API publishes', async ({ page }) => {
    await page.route('**/auth/password-policy', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          minLength: 11,
          minCharacterClasses: 3,
          characterClasses: ['letters', 'digits', 'symbols'],
        }),
      }),
    );

    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Make one' }).click();

    await expect(
      page.getByText('At least 11 characters, mixing 3 of', { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '11');
  });

  /**
   * Tailwind resolves conflicting utilities by stylesheet order, not attribute order, so the active
   * link's colour is pinned.
   */
  test('the current page nav link is drawn in the active ink, not the dim colour', async ({
    page,
  }) => {
    await page.goto('/hub');
    const current = page.locator('a[aria-current="page"]');
    await expect(current).toHaveText(/hub/i);

    const { lit, dim } = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const read = (token: string): string => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const lit = read('--color-active-ink');
      const dim = read('--color-ink-3');
      probe.remove();
      return { lit, dim };
    });

    expect(lit).not.toBe(dim);
    // Retried: the link eases into its colour, and a single read can land on the way there.
    await expect(current).toHaveCSS('color', lit);
  });

  /**
   * The dev config.json registers no client with any provider. A button that sends someone to a
   * provider's own error page reads as broken; one that is down, and says why, reads as not set up.
   */
  test('sign-in buttons for unconfigured providers are down and say why', async ({ page }) => {
    await page.goto('/sign-in');
    const down = page.getByTitle('Not configured on this server.');
    await expect(down).toHaveCount(3);
    for (const button of await down.all()) {
      await expect(button).toBeDisabled();
    }
  });

  /** Games and actions answer to the same field, and the arrows reach across both groups. */
  test('Ctrl-K opens the command palette, which finds a game and runs an action', async ({
    page,
  }) => {
    await page.route('**/auth/refresh', (route) =>
      route.fulfill({ status: 401, json: { message: 'no' } }),
    );
    await page.route('**/projects/releases/paginated**', (route) => {
      const searched = new URL(route.request().url()).searchParams.has('search');
      return route.fulfill({ json: { projects: searched ? [release] : [], total: 0 } });
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/hub');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

    await page.keyboard.press('Control+k');
    const field = page.getByRole('combobox', { name: 'Search games and commands' });
    await expect(field).toBeFocused();
    await expect(page.getByRole('option', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'My games' })).toHaveCount(0);

    await field.fill('e');
    await expect(page.getByRole('option', { name: 'Cave Diver' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Hub' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(field).toHaveCount(0);

    await page.keyboard.press('Control+k');
    await field.fill('theme');
    await expect(page.getByRole('option')).toHaveCount(2);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { name: 'Toggle theme' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Enter');

    await expect(field).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
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
