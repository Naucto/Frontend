import type { Locator, Page } from '@playwright/test';

import { uuidOf } from '../packages/api-client/testing';
import { expect, test } from './fixtures';
import { PLAY, release, serveGame } from './mocks/game';
import { JOINS_FROM_INIT, mockRoom, ROOM } from './mocks/netplay';
import { answer, mockSignedIn } from './mocks/session';

/**
 * Written before `net.invite`: it joins when the player presses the action of its menu, and stops
 * on an error that says so once it is in.
 */
const JOINS_FROM_MENU = [
  'local asked, joined',
  'function _update()',
  '  if joined then error("joined as " .. net.id()) end',
  '  if not asked and input.btnp("a") then',
  '    asked = true',
  '    net.join(function() joined = true end)',
  '  end',
  'end',
].join('\n');

const link = `${PLAY}?session=${ROOM.sessionUuid}`;
const strip = (page: Page): Locator => page.locator('nc-session-strip');
const play = (page: Page): Locator =>
  page.getByRole('button', { name: 'Play', exact: true }).first();

test.describe('a game opened on a session', () => {
  test('says which session before it starts, and joins it from _init without a dialog', async ({
    page,
  }) => {
    await serveGame(page, JOINS_FROM_INIT);
    await mockSignedIn(page);
    const room = await mockRoom(page);

    await page.goto(link);
    await expect(strip(page)).toContainText('Friday night');
    await expect(strip(page)).toContainText('hosted by louis');
    await expect(strip(page).getByRole('img', { name: 'louis' })).toBeVisible();
    await expect(strip(page).locator('nc-chip')).toHaveText('2 of 4');

    await play(page).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('in Friday night of louis, 2 of 4');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(room.joins).toEqual([{ editorTest: false }]);
    // A reload would otherwise go back into a session the player may have left since.
    await expect(page).toHaveURL(new RegExp(`${PLAY}$`));
    await expect(strip(page)).toHaveCount(0);

    // The invite lasts the visit: a restart goes back in.
    await alert.getByRole('button', { name: 'Restart' }).click();
    await expect.poll(() => room.joins.length).toBe(2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('is joined by a game that only joins from its own menu, with the code of the link', async ({
    page,
  }) => {
    await serveGame(page, JOINS_FROM_MENU);
    await mockSignedIn(page);
    const room = await mockRoom(page);

    await page.goto(`${link}&code=WXYZ`);
    await expect(strip(page)).toContainText('Friday night');
    expect(room.lookups[0]).toBe('?code=WXYZ');

    await play(page).click();
    await page.keyboard.down('Space');
    await expect(page.getByRole('alert')).toContainText('joined as 1');
    await page.keyboard.up('Space');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(room.joins).toEqual([{ joinCode: 'WXYZ', editorTest: false }]);
    await expect(page).toHaveURL(new RegExp(`${PLAY}$`));
  });

  test('says when the session has ended, and a join then tells why and opens the dialog', async ({
    page,
  }) => {
    await serveGame(page, JOINS_FROM_MENU);
    await mockSignedIn(page);
    await page.route(`**/game-sessions?projectId=${release.id}`, answer(200, { sessions: [] }));
    const room = await mockRoom(page, ROOM, { gone: true });

    await page.goto(link);
    await expect(strip(page)).toContainText('This session has ended.');
    await expect(strip(page).getByRole('button', { name: 'Play alone' })).toBeVisible();

    await play(page).click();
    await page.keyboard.down('Space');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Join a session' })).toBeVisible();
    await page.keyboard.up('Space');
    await expect(page.locator('nc-toast-host').getByText('This session has ended.')).toBeVisible();
    expect(room.joins).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`${PLAY}$`));
  });

  test('tells the player a full session is full, and opens the dialog', async ({ page }) => {
    await serveGame(page, JOINS_FROM_MENU);
    await mockSignedIn(page);
    await page.route(`**/game-sessions?projectId=${release.id}`, answer(200, { sessions: [] }));
    await mockRoom(
      page,
      { ...ROOM, playerCount: 4 },
      { refuse: { status: 409, message: 'Game session is full' } },
    );

    await page.goto(link);
    await expect(strip(page).locator('nc-chip')).toHaveText('4 of 4');
    await play(page).click();
    await page.keyboard.down('Space');
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Join a session' }),
    ).toBeVisible();
    await page.keyboard.up('Space');
    await expect(page.locator('nc-toast-host').getByText('Game session is full')).toBeVisible();
  });

  test('asks a signed-out visitor to sign in at Play, then joins', async ({ page }) => {
    await serveGame(page, JOINS_FROM_INIT);
    await page.route('**/auth/login', answer(200, { access_token: 'token' }));
    await page.route(
      '**/users/profile',
      answer(200, {
        id: uuidOf(9),
        email: 'kay@example.com',
        username: 'kay',
        nickname: null,
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
    );
    const room = await mockRoom(page);

    await page.goto(link);
    await expect(
      strip(page).getByRole('button', { name: 'Sign in to join the session' }),
    ).toBeVisible();
    expect(room.lookups).toEqual([]);

    await play(page).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await dialog.getByLabel('Email').fill('kay@example.com');
    await dialog.getByLabel('Password').fill('correct horse battery staple');
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText('in Friday night of louis, 2 of 4');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(room.joins).toHaveLength(1);
    await expect(page).toHaveURL(new RegExp(`${PLAY}$`));
  });

  test('starts without the session for a visitor who would rather play alone', async ({ page }) => {
    await serveGame(page, JOINS_FROM_INIT);
    await mockSignedIn(page);
    const room = await mockRoom(page);

    await page.goto(link);
    await strip(page).getByRole('button', { name: 'Play alone' }).click();

    await expect(page.getByRole('alert')).toContainText('at the menu');
    await expect(strip(page)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`${PLAY}$`));
    expect(room.joins).toEqual([]);
  });

  test('asks which session once the player has left the one they came for', async ({ page }) => {
    await serveGame(
      page,
      'function _init()\n  net.join(function()\n    net.leave()\n    net.join()\n  end)\nend',
    );
    await mockSignedIn(page);
    await page.route(`**/game-sessions?projectId=${release.id}`, answer(200, { sessions: [] }));
    const room = await mockRoom(page);

    await page.goto(link);
    await expect(strip(page)).toContainText('Friday night');
    await play(page).click();

    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Join a session' }),
    ).toBeVisible();
    expect(room.joins).toHaveLength(1);
  });

  test('asks which session once the host has ended the one they came for', async ({ page }) => {
    await serveGame(
      page,
      [
        'local ended, asked',
        'function _init()',
        '  net.join(function()',
        '    net.on("ended", function() ended = true end)',
        '  end)',
        'end',
        'function _update()',
        '  if ended and not asked then',
        '    asked = true',
        '    net.join()',
        '  end',
        'end',
      ].join('\n'),
    );
    await mockSignedIn(page);
    await page.route(`**/game-sessions?projectId=${release.id}`, answer(200, { sessions: [] }));
    const room = await mockRoom(page);

    await page.goto(link);
    await expect(strip(page)).toContainText('Friday night');
    await play(page).click();
    await expect.poll(() => room.end()).toBe(true);

    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Join a session' }),
    ).toBeVisible();
    expect(room.joins).toHaveLength(1);
  });
});
