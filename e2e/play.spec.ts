import { expect, test } from './fixtures';
import { release, serveGame, servePreset } from './mocks/game';
import { setGamepads } from './mocks/gamepads';
import { answer, mockSignedIn } from './mocks/session';

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
 * The words come from the document, so the table is right before the game has run: nothing here
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
  const howTo = page.locator('nc-how-to-play');
  await expect(howTo.getByRole('heading', { name: 'How to play' })).toBeVisible();
  await expect(howTo.getByRole('rowheader')).toHaveCount(9);
  await expect(howTo.getByRole('rowheader').first()).toHaveText('Left');
  const jump = howTo.getByRole('row', { name: /Jump/ });
  await expect(jump.locator('nc-input-cap')).toHaveText(['x', 'Space', 'n', 'A']);
});

test.describe('how to play', () => {
  test('stands between the screen and the comments, a row per action of a one-player game', async ({
    page,
  }) => {
    await servePreset(page, 'platformer');
    await page.goto('/play/42');

    const howTo = page.locator('nc-how-to-play');
    await expect(howTo.getByRole('table')).toHaveCount(2);
    await expect(howTo.getByRole('columnheader')).toHaveText([
      'Action',
      'Keys',
      'Pad',
      'Action',
      'Keys',
      'Pad',
    ]);
    const jump = howTo.getByRole('row', { name: /Jump/ });
    await expect(jump.getByRole('rowheader')).toContainText('Hold to jump higher');
    const keys = jump.getByRole('cell').first();
    await expect(keys.locator('nc-input-cap')).toHaveText(['Space', 'up', 'w', 'z']);
    await expect(keys.getByText('or', { exact: true })).toHaveCount(3);
    await expect(jump.getByRole('cell').last().locator('nc-input-cap')).toHaveText(['A']);
    await expect(howTo.getByRole('rowheader', { name: 'Crouch', exact: true })).toBeVisible();

    const [screen, table, comments] = await Promise.all(
      [page.locator('nc-game-screen'), howTo, page.locator('nc-comments')].map((part) =>
        part.boundingBox(),
      ),
    );
    expect(table?.y).toBeGreaterThan((screen?.y ?? 0) + (screen?.height ?? 0) - 1);
    expect(comments?.y).toBeGreaterThan((table?.y ?? 0) + (table?.height ?? 0) - 1);
    await expect(page.locator('aside nc-how-to-play')).toHaveCount(0);
  });

  test('gives each keyboard player a column in a two-player game', async ({ page }) => {
    await servePreset(page, 'two-players');
    await page.goto('/play/42');

    const table = page.locator('nc-how-to-play').getByRole('table').first();
    await expect(table.getByRole('columnheader')).toHaveText(['Action', /P1/, /P2/, 'Pad']);
    const left = table.getByRole('row', { name: 'Left' });
    await expect(left.getByRole('cell').nth(0).locator('nc-input-cap')).toHaveText(['a', 'q']);
    await expect(left.getByRole('cell').nth(1).locator('nc-input-cap')).toHaveText(['left']);
  });

  test('folds away, and is still folded when the page is opened again', async ({ page }) => {
    await servePreset(page, 'platformer');
    await page.goto('/play/42');
    const howTo = page.locator('nc-how-to-play');
    await expect(howTo.getByRole('table')).toHaveCount(2);

    await howTo.getByRole('button', { name: 'Hide how to play' }).click();
    await expect(howTo.getByRole('table')).toHaveCount(0);
    await expect(howTo.getByRole('heading', { name: 'How to play' })).toBeVisible();

    await page.reload();
    const show = howTo.getByRole('button', { name: 'Show how to play' });
    await expect(show).toHaveAttribute('aria-expanded', 'false');
    await expect(howTo.getByRole('table')).toHaveCount(0);

    await show.click();
    await expect(howTo.getByRole('table')).toHaveCount(2);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('keeps every table inside the page', async ({ page }) => {
      await servePreset(page, 'two-players');
      await page.goto('/play/42');
      const tables = page.locator('nc-how-to-play').getByRole('table');
      await expect(tables).toHaveCount(2);

      for (const table of await tables.all()) {
        const box = await table.boundingBox();
        expect(box?.x).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
      }
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
    });
  });

  test.describe('on a touch device', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('shows the control of the on-screen pad instead of keys', async ({ page }) => {
      await servePreset(page, 'platformer');
      await page.goto('/play/42');

      const table = page.locator('nc-how-to-play').getByRole('table').first();
      await expect(table.getByRole('columnheader')).toHaveText(['Action', 'Touch']);
      await expect(table.getByRole('row', { name: /Jump/ }).locator('nc-input-cap')).toHaveText([
        'A',
      ]);
    });

    test('fits the nine controls of the pad in the screen, at its largest size', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem('naucto.pad-layout', JSON.stringify({ size: 140, opacity: 85 }));
      });
      await servePreset(page, 'classic');
      await page.goto('/play/42');

      const keys = page.locator('nc-virtual-pad [data-nc-control]:visible');
      await expect(keys).toHaveCount(9);
      const boxes = await keys.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().toJSON() as DOMRect),
      );
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(390);
        expect(box.width).toBe(Math.round(box.width));
        expect(box.left).toBe(Math.round(box.left));
      }
      const apart = (a: DOMRect, b: DOMRect): boolean =>
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      for (const [i, box] of boxes.entries()) {
        for (const other of boxes.slice(i + 1)) {
          expect(apart(box, other)).toBe(true);
        }
      }
      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
    });
  });
});

test.describe('controls of the player', () => {
  const TEST_PAD = { id: 'Test Pad (STANDARD GAMEPAD Vendor: 0000 Product: 0000)' };

  test('the gear of the transport opens the controls over the game', async ({ page }) => {
    await setGamepads(page, []);
    await servePreset(page, 'platformer');
    await page.goto('/play/42');

    await page.getByRole('button', { name: 'Controls' }).click();
    const dialog = page.locator('nc-controls-dialog');
    await expect(dialog.getByRole('heading', { name: 'Controls', exact: true })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'No gamepad connected' })).toBeVisible();
    await expect(dialog.getByRole('slider', { name: 'Size' })).toBeVisible();
    await expect(dialog.getByRole('slider', { name: 'Opacity' })).toBeVisible();

    await setGamepads(page, [TEST_PAD]);
    await expect(dialog.getByRole('button', { name: 'Plays as player 1' })).toBeVisible();
    await expect(dialog.locator('[data-pad="0"]')).toContainText('Test Pad');
    await expect(dialog.locator('[data-pad="0"]')).not.toContainText('STANDARD');

    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Gamepads' })).toHaveCount(0);
  });

  test('a held button and a leaning stick light on the drawn gamepad, live', async ({ page }) => {
    await setGamepads(page, [TEST_PAD]);
    await servePreset(page, 'platformer');
    await page.goto('/play/42');
    await page.getByRole('button', { name: 'Controls' }).click();
    const pad = page.locator('nc-controls-dialog [data-pad="0"]');
    await expect(pad.locator('[data-part]')).toHaveCount(16);
    await expect(pad.locator('[data-lit]')).toHaveCount(0);

    await setGamepads(page, [{ ...TEST_PAD, held: [0, 12], axes: [-1, 0, 0, 0] }]);
    await expect(pad.locator('[data-part="a"]')).toHaveAttribute('data-lit', '');
    await expect(pad.locator('[data-part="dpad-up"]')).toHaveAttribute('data-lit', '');
    await expect(pad.locator('[data-part="ls"]')).toHaveAttribute('data-lit', '');
    await expect(pad.locator('[data-lit]')).toHaveCount(3);
    const lit = await pad
      .locator('[data-part="a"] .face')
      .evaluate((face) => getComputedStyle(face).fill);
    expect(lit).toBe('rgb(255, 209, 0)');

    await setGamepads(page, [TEST_PAD]);
    await expect(pad.locator('[data-lit]')).toHaveCount(0);
  });

  /**
   * The game says which player pressed the one way a player can see: it stops on an error that
   * names it.
   */
  test('a gamepad seated as another player plays as that player in the running game', async ({
    page,
  }) => {
    await setGamepads(page, [TEST_PAD]);
    await serveGame(
      page,
      [
        'function _update()',
        '  if input.btnp("a", 2) then error("player two pressed a") end',
        '  if input.btnp("a") then error("player one pressed a") end',
        'end',
      ].join('\n'),
    );
    await page.goto('/play/42');
    await page.getByRole('button', { name: 'Play' }).first().click();
    const alert = page.getByRole('alert');

    await setGamepads(page, [{ ...TEST_PAD, held: [0] }]);
    await expect(alert).toContainText('player one pressed a');
    await setGamepads(page, [TEST_PAD]);
    await alert.getByRole('button', { name: 'Restart' }).click();
    await expect(alert).toHaveCount(0);

    await page.getByRole('button', { name: 'Controls' }).click();
    const dialog = page.locator('nc-controls-dialog');
    await dialog.getByRole('button', { name: 'Plays as player 1' }).click();
    const seats = page.getByRole('menu').getByRole('menuitemradio');
    await expect(seats).toHaveText([/P1\s*This gamepad/, /P2\s*Free/, /P3\s*Free/, /P4\s*Free/]);
    await seats.nth(1).click();
    await expect(dialog.getByRole('button', { name: 'Plays as player 2' })).toBeVisible();
    await expect(dialog.locator('article').first()).toContainText('P1 open');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('nc-game-screen canvas')).toBeFocused();

    await setGamepads(page, [{ ...TEST_PAD, held: [0] }]);
    await expect(alert).toContainText('player two pressed a');
  });
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

/**
 * A room is created reached by its code, which is what mints the code, and listed right after: the
 * host dialog then shows both the code and the switch on.
 */
test('a game that asks for a listed room gets one, and the host dialog says so', async ({
  page,
}) => {
  const uuid = '5b1d2a0e-93c4-4f6e-8a57-0c7de1f2a934';
  const asked: unknown[] = [];
  await serveGame(
    page,
    'function _init()\n  net.host({ listed = true, title = "Friday night" })\nend',
  );
  await mockSignedIn(page);
  await page.route('**/game-sessions', (route) => {
    asked.push(route.request().postDataJSON());
    return answer(201, {
      sessionUuid: uuid,
      playerId: 1,
      joinCode: 'ABCD2345',
      connectionTicket: 'ticket',
      webrtcConfig: {
        signaling: ['ws://localhost/e2e-game-socket'],
        peerOpts: { config: { iceServers: [] } },
      },
    })(route);
  });
  await page.route(`**/game-sessions/${uuid}`, (route) => {
    if (route.request().method() === 'PATCH') {
      asked.push(route.request().postDataJSON());
    }
    return answer(200, { sessionUuid: uuid, visibility: 'PUBLIC' })(route);
  });
  await page.routeWebSocket(/e2e-game-socket/, () => undefined);

  await page.goto('/play/42');
  await page.getByRole('button', { name: 'Play' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Start hosting' }).click();

  await expect(dialog.getByRole('switch', { name: 'Listed in browse' })).toBeChecked();
  await expect(dialog).toContainText('ABCD2345');
  expect(asked).toEqual([
    {
      projectId: 42,
      title: 'Friday night',
      maxPlayers: 2,
      visibility: 'INVITE_CODE',
      editorTest: false,
    },
    { visibility: 'PUBLIC' },
  ]);
});
