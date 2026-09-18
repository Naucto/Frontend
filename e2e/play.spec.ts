import { type Route } from '@playwright/test';

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
