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
  await expect(alert).toContainText('main:3');
  await expect(alert).toContainText('update:');

  // Restart runs the game again from the top; it errors again, so the banner comes back.
  await alert.getByRole('button', { name: 'Restart' }).click();
  await expect(alert).toContainText('main:3');
});

/**
 * The words come from the document, so the panel is right before the game has run: nothing here
 * presses Play. The served game predates actions of its own, so what it shows is what opening it
 * gave it: the nine it always had, under the names its author gave some, with the keys they had.
 */
test('how to play shows the actions an old game is given, under the names it gave them', async ({
  page,
}) => {
  await serveGame(page, 'function _update() end', {
    actions: [{ action: 'a', label: 'Jump' }],
  });

  await page.goto('/play/42');
  await expect(page.getByText('How to play')).toBeVisible();
  const rows = page.locator('nc-how-to-play dl > div');
  await expect(rows).toHaveCount(9);
  const jump = rows.filter({ has: page.getByText('Jump', { exact: true }) });
  await expect(jump.locator('nc-input-cap')).toHaveText(['x', 'Space', 'n', 'A']);
  await expect(rows.first().locator('dt')).toHaveText('Left');
});

/**
 * A published game has no console, so the game says it read the action the one way a player can
 * see: it stops on an error that names it. The code is a v1 game's, read through every migration.
 */
test('a game saved before it had actions of its own answers to the keys it always had', async ({
  page,
}) => {
  await serveGame(
    page,
    [
      'function _update()',
      '  if input.btn("right", 2) then error("player two goes right") end',
      '  if input.btnp("a") then error("player one pressed a") end',
      'end',
    ].join('\n'),
  );

  await page.goto('/play/42');
  await page.getByRole('button', { name: 'Play' }).first().click();
  const alert = page.getByRole('alert');
  // A key no action holds, and player one's own "right": neither is what the code reads.
  await page.keyboard.down('F8');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(200);
  await page.keyboard.up('F8');
  await page.keyboard.up('ArrowRight');
  await expect(alert).toHaveCount(0);

  await page.keyboard.down('l');
  await expect(alert).toContainText('player two goes right');
  await page.keyboard.up('l');

  await alert.getByRole('button', { name: 'Restart' }).click();
  await expect(alert).toHaveCount(0);
  await page.keyboard.down('Space');
  await expect(alert).toContainText('player one pressed a');
  await page.keyboard.up('Space');
});
