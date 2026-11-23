import { readFileSync } from 'node:fs';

import { expect, type Page, test } from './fixtures';
import { ADA, ALEXIS, by, mockCollections } from './mocks/collections';
import { hubGame } from './mocks/hub';
import { answer, mockSignedIn } from './mocks/session';

const BANNER = readFileSync(new URL('./mocks/banner.png', import.meta.url));

/** Ada's profile and her shelves: two games of her own, one liked, nothing else. */
async function mockAda(page: Page, banner: boolean): Promise<void> {
  await page.route(
    '**/users/public/username/ada/profile',
    answer(200, {
      data: {
        ...ADA,
        nickname: null,
        description: 'Makes small games about tides.',
        createdAt: '2026-01-01T00:00:00.000Z',
        profileImageUrl: null,
        backgroundImageUrl: banner ? '/e2e/banner.png' : null,
      },
    }),
  );
  await page.route('**/e2e/banner.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: BANNER }),
  );
  await page.route(
    new RegExp(`/users/public/${ADA.id}/published-games`),
    answer(200, [hubGame(11, 'Hightide'), hubGame(12, 'Frog Hop')]),
  );
  await page.route(
    `**/users/public/${ADA.id}/likes`,
    answer(200, [hubGame(13, 'Pong Royale', by(ALEXIS))]),
  );
  await page.route(`**/users/public/${ADA.id}/collaborations`, answer(200, []));
  await page.route(`**/users/public/${ADA.id}/remixes`, answer(200, []));
  await page.route(`**/users/${ADA.id}/friendship`, answer(200, { status: 'NONE' }));
  await mockCollections(page, []);
}

/** How many colours the backdrop holds over the first 300px of the page's own content. */
const coloursAtTop = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('nc-dither-backdrop canvas');
    const root = document.querySelector('[data-testid="profile-root"]');
    const context = canvas?.getContext('2d');
    if (!canvas || !root || !context) {
      return 0;
    }
    const row = Math.round(root.getBoundingClientRect().top / 3);
    const { data } = context.getImageData(0, row, canvas.width, 100);
    const seen = new Set<string>();
    for (let i = 0; i < data.length; i += 4) {
      seen.add(`${String(data[i])},${String(data[i + 1])},${String(data[i + 2])}`);
    }
    return seen.size;
  });

test.describe('a profile', () => {
  test('stands on its banner, and on the bare ground without one', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await mockAda(page, true);
    await page.goto('/u/ada');
    await expect(page.getByRole('heading', { level: 1, name: 'ada' })).toBeVisible();
    await expect.poll(() => coloursAtTop(page)).toBeGreaterThan(4);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route('**/auth/refresh', answer(401, {}));
    await mockAda(page, false);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'ada' })).toBeVisible();
    await expect.poll(() => coloursAtTop(page)).toBe(1);
  });

  test('shows each kind of game on a shelf of its own, and no shelf for an empty one', async ({
    page,
  }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await mockAda(page, false);
    await page.goto('/u/ada');

    await expect(page.locator('[data-shelf="games"]').getByRole('link')).toHaveCount(2);
    await expect(page.locator('[data-shelf="liked"]').getByRole('link')).toHaveCount(1);
    await expect(page.locator('[data-shelf="collabs"]')).toHaveCount(0);
    await expect(page.locator('[data-shelf="remixes"]')).toHaveCount(0);
    await expect(page.getByRole('radio')).toHaveCount(0);

    await expect(page.getByText('Joined 2026')).toBeVisible();
    const handle = page.getByText('@ada', { exact: true });
    expect(await handle.evaluate((el) => getComputedStyle(el).fontFamily)).toContain(
      'HD44780 Mono',
    );
  });

  test('gives its owner the banner to set, then to change or remove, and no colour to pick', async ({
    page,
  }) => {
    await mockSignedIn(page, ADA);
    await mockAda(page, false);
    await page.goto('/u/ada');

    await expect(page.getByText('Colour', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove the banner' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Set a banner' }).click();
    await expect(page.getByRole('dialog')).toContainText('PROFILE BANNER');
    await page.keyboard.press('Escape');

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await mockSignedIn(page, ADA);
    await mockAda(page, true);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Change banner' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove the banner' })).toBeVisible();
  });
});
