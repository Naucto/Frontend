import type { Page } from '@playwright/test';

import { uuidOf } from '../packages/api-client/testing';
import { mockEditor, PROJECT_ID } from './editor-mocks';
import { expect, test } from './fixtures';
import { PLAY, release, serveGame } from './mocks/game';
import { mockRoom, ROOM } from './mocks/netplay';
import { answer } from './mocks/session';

/** The number each game was known by while games were numbered. */
const NUMBERS: Record<string, string> = { '41': release.id, '7': PROJECT_ID };

/**
 * The server's translation of an old number, for the two games above and no other. Returns the
 * path of every request the app sends, in order.
 */
async function mockOldNumbers(page: Page): Promise<string[]> {
  const asked: string[] = [];
  page.on('request', (request) => {
    if (['fetch', 'xhr'].includes(request.resourceType())) {
      asked.push(new URL(request.url()).pathname);
    }
  });
  await page.route('**/projects/legacy/*', (route) => {
    const id = NUMBERS[new URL(route.request().url()).pathname.split('/').pop() ?? ''];
    return id ? answer(200, { id })(route) : answer(404, { message: 'Not found' })(route);
  });
  return asked;
}

/** The requests that named something by a number. */
const numbered = (asked: string[]): string[] =>
  asked.filter((path) => path.split('/').some((segment) => /^\d+$/.test(segment)));

test.describe('a link written while games were numbered', () => {
  test('opens the game page on its id, with the session it was shared for', async ({ page }) => {
    await serveGame(page, 'function _update() end');
    await mockRoom(page);
    const asked = await mockOldNumbers(page);
    await page.goto('/hub');

    await page.goto(`/play/41?session=${ROOM.sessionUuid}&code=K7QD`);

    await expect(page).toHaveURL(`${PLAY}?session=${ROOM.sessionUuid}&code=K7QD`);
    await expect(page.getByRole('heading', { name: 'Cave Diver' })).toBeVisible();
    await expect(page.locator('nc-session-strip')).toBeVisible();
    // The number is asked about once, and nothing else is ever asked by number.
    expect(numbered(asked)).toEqual(['/projects/legacy/41']);
    // The numbered address left no entry: Back is the page before it.
    await page.goBack();
    await expect(page).toHaveURL(/\/hub$/);
  });

  test('opens the editor on its id and on the tab the link named', async ({ page }) => {
    await mockEditor(page);
    const asked = await mockOldNumbers(page);

    await page.goto('/edit/7/code');

    await expect(page).toHaveURL(new RegExp(`/edit/${PROJECT_ID}/code$`));
    await expect(page.locator('.cm-content')).toContainText('Naucto starter game');
    expect(numbered(asked)).toEqual(['/projects/legacy/7']);
  });

  test('opens the editor on its first tab when the link named none', async ({ page }) => {
    await mockEditor(page);
    await mockOldNumbers(page);

    await page.goto('/edit/7');

    await expect(page).toHaveURL(new RegExp(`/edit/${PROJECT_ID}/game$`));
    await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Platformer');
  });

  for (const address of ['staff/edit', 'staff/play']) {
    test(`ends at the editor on its id from the old /${address} address`, async ({ page }) => {
      await mockEditor(page, { staff: true });
      await mockOldNumbers(page);

      await page.goto(`/${address}/7`);

      await expect(page).toHaveURL(new RegExp(`/edit/${PROJECT_ID}/game$`));
      await expect(page.getByTestId('read-only-band')).toBeVisible();
    });
  }

  test('is not found when no game had that number, and keeps its address', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    const asked = await mockOldNumbers(page);

    await page.goto('/play/999');

    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    await expect(page).toHaveURL(/\/play\/999$/);
    expect(numbered(asked)).toEqual(['/projects/legacy/999']);
  });
});

for (const address of ['/play/cave-diver', '/play/41abc', `/edit/${uuidOf(7)}x/code`]) {
  test(`${address} is neither an id nor a number: not found, and nothing is asked about it`, async ({
    page,
  }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    const asked = await mockOldNumbers(page);

    await page.goto(address);

    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    expect(asked.filter((path) => path.startsWith('/projects'))).toEqual([]);
  });
}
