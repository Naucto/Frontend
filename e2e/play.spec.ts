import { type Page, type Route } from '@playwright/test';
import * as Y from 'yjs';

import { expect, test } from './fixtures';

const release = {
  id: 42,
  name: 'Cave Diver',
  shortDesc: 'Dive.',
  longDesc: null,
  tags: ['remixable'],
  iconUrl: null,
  status: 'COMPLETED',
  monetization: 'NONE',
  price: null,
  userId: 7,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  publishedAt: '2026-09-01T00:00:00.000Z',
  viewCount: 12,
  uniquePlayers: 3,
  activePlayers: 0,
  likes: 1,
  collaborators: [],
  creator: { id: 7, username: 'ada' },
};

const answer =
  (status: number, body: unknown) =>
  (route: Route): Promise<void> =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test.describe('play page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await page.route('**/projects/releases/42', answer(200, release));
  });

  /**
   * REMIX used to stand greyed for a signed-out reader, with nothing on screen saying why. It now
   * asks, and the remix the reader came for goes through once they have signed in — over the page,
   * so the game they were looking at is still there behind the dialog.
   */
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

/** A release whose document holds one `main` file, served as the signed content of game 42. */
const serveGame = async (
  page: Page,
  code: string,
  meta: Record<string, unknown> = {},
): Promise<void> => {
  const doc = new Y.Doc();
  doc.getMap('game.meta').set('schemaVersion', 1);
  for (const [key, value] of Object.entries(meta)) doc.getMap('game.meta').set(key, value);
  const main = new Y.Map<unknown>();
  const text = new Y.Text();
  doc.getMap('code.files').set('main', main);
  main.set('name', 'main');
  main.set('order', 0);
  main.set('text', text);
  text.insert(0, code);
  doc.getMap('code.meta').set('entry', 'main');
  const bytes = Buffer.from(Y.encodeStateAsUpdate(doc));

  await page.route('**/auth/refresh', answer(401, {}));
  await page.route('**/projects/releases/42', answer(200, release));
  await page.route('**/projects/releases/42/content-url', (route) =>
    route.fulfill({ json: { signedUrl: 'http://localhost:3001/e2e/game.bin' } }),
  );
  await page.route('**/e2e/game.bin', (route) =>
    route.fulfill({ status: 200, body: bytes, contentType: 'application/octet-stream' }),
  );
};

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
