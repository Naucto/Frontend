import { expect, test } from './fixtures';
import { release, serveGame } from './mocks/game';
import { answer } from './mocks/session';

test.describe('play page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await page.route('**/projects/releases/42', answer(200, release));
  });

  /** REMIX asks a signed-out reader to sign in over the page, then forks. */
  test('remix asks a signed-out reader to sign in, then forks', async ({ page }) => {
    await page.route('**/auth/login', answer(200, { access_token: 'token' }));
    await page.route(
      '**/users/profile',
      answer(200, {
        id: 9,
        email: 'kay@example.com',
        username: 'kay',
        nickname: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
    );
    await page.route('**/projects/42/fork', answer(201, { id: 77, name: 'Cave Diver (remix)' }));

    await page.goto('/play/42');
    const remix = page.getByRole('button', { name: 'Remix' });
    await expect(remix).toBeEnabled();
    await remix.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await dialog.getByLabel('Email').fill('kay@example.com');
    await dialog.getByLabel('Password').fill('correct horse battery staple');
    const forked = page.waitForRequest('**/projects/42/fork');
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    expect((await forked).method()).toBe('POST');
    await expect(page).toHaveURL(/\/edit\/77/);
  });

  test('cancelling the sign-in leaves the page where it was', async ({ page }) => {
    await page.goto('/play/42');
    await page.getByRole('button', { name: 'Remix' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/play\/42$/);
  });
});

/**
 * A published game that errors has no console for the player to read. The screen says it stopped,
 * names the line, and offers a restart, instead of freezing on its last frame.
 */
test('a game that errors tells the player, and restarts from the banner', async ({ page }) => {
  await serveGame(page, 'function _update()\n  local t = nil\n  t.x = 1\nend');

  await page.goto('/play/42');
  await page.getByRole('button', { name: 'Play' }).first().click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The game stopped on an error');
  await expect(alert).toContainText('main:3 · update:');

  // Restart runs the game again from the top; it errors again, so the banner comes back.
  await alert.getByRole('button', { name: 'Restart' }).click();
  await expect(alert).toContainText('main:3');
});

/**
 * The words come from the document, so the panel is right before the game has run: nothing here
 * presses Play.
 */
test('how to play shows the names the document gives its actions', async ({ page }) => {
  await serveGame(page, 'function _update() end', {
    actions: [{ action: 'a', label: 'Jump' }],
  });

  await page.goto('/play/42');
  await expect(page.getByText('How to play')).toBeVisible();
  await expect(page.getByText('Jump', { exact: true })).toBeVisible();
});
