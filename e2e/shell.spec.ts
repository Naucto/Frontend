import { uuidOf } from '../packages/api-client/testing';
import { expect, type Page, test } from './fixtures';
import { PLAY, release, serveGame } from './mocks/game';
import { setGamepads } from './mocks/gamepads';
import { JOINS_FROM_INIT, mockRoom } from './mocks/netplay';
import { mockNotifications } from './mocks/notifications';
import { answer, mockSignedIn } from './mocks/session';

const popular = [1, 2, 3].map((number) => ({
  ...release,
  id: uuidOf(number),
  name: `Popular ${String(number)}`,
  coverUrl: null,
  disk: null,
}));

const room = {
  sessionUuid: 'room-1',
  title: 'High Tide',
  visibility: 'PUBLIC',
  hostId: uuidOf(11),
  hostUsername: 'louis',
  projectId: uuidOf(9),
  projectName: 'High Tide',
  maxPlayers: 4,
  playerCount: 2,
  startedAt: '2026-11-20T10:00:00.000Z',
  roster: [{ id: uuidOf(11), username: 'louis' }],
  coverUrl: null,
  disk: null,
};

/** What the search box asks for: three popular games, one game and one tag for any word typed. */
async function mockSearch(page: Page): Promise<void> {
  await page.route('**/projects/releases/paginated**', (route) => {
    const searched = new URL(route.request().url()).searchParams.has('search');
    return route.fulfill({ json: { projects: searched ? [release] : popular, total: 3 } });
  });
  await page.route(
    '**/projects/releases/tags**',
    answer(200, { tags: [{ tag: 'caves', count: 3 }] }),
  );
  await page.route(
    '**/users/public/search**',
    answer(200, { statusCode: 200, message: '', data: [{ id: uuidOf(5), username: 'cavefan' }] }),
  );
  await page.route('**/game-sessions**', answer(200, { sessions: [room] }));
}

test.describe('app shell', () => {
  test('hub renders with navigation and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('contentinfo')).toContainText('Draw, code and play together');
  });

  /** Every destination of the footer, under the heading of its column. */
  test('the footer stands in four columns, and folds them behind their headings on a phone', async ({
    page,
  }) => {
    await page.goto('/hub');
    const footer = page.getByRole('contentinfo');
    const links = {
      Product: ['Hub', 'Learn', 'Make a game'],
      Community: ['Friends', 'GitHub', 'Feedback', 'Report a problem'],
      Legal: ['GPL-3.0', 'Privacy', 'Security'],
    };
    for (const [heading, names] of Object.entries(links)) {
      const column = footer.getByRole('navigation', { name: heading });
      await expect(column.getByRole('listitem')).toHaveText(names);
    }
    await expect(footer.getByRole('link', { name: 'Make a game' })).toHaveAttribute(
      'href',
      '/games/new',
    );
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    await expect(footer.getByRole('link', { name: 'Security' })).toHaveAttribute(
      'href',
      'https://github.com/Naucto/Frontend/security',
    );
    const columns = await Promise.all(
      ['Product', 'Community', 'Legal'].map((name) =>
        footer.getByRole('navigation', { name }).boundingBox(),
      ),
    );
    expect(new Set(columns.map((box) => box?.y)).size).toBe(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeHidden();
    await footer.getByRole('button', { name: 'Legal' }).click();
    await expect(footer.getByRole('link', { name: 'Privacy' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Learn' })).toBeHidden();
  });

  test('the search box offers the popular games as disks, then what the words find', async ({
    page,
  }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await mockSearch(page);
    await page.goto('/hub');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();

    await page.keyboard.press('/');
    const box = page.getByRole('combobox', { name: 'Search games, people, tags…' });
    await expect(box).toBeFocused();
    const list = page.getByRole('listbox', { name: 'Suggestions' });
    const games = list.getByRole('group', { name: 'Popular' });
    await expect(games.getByRole('option')).toHaveCount(3);
    await expect(games.locator('nc-floppy')).toHaveCount(3);
    await expect(list.getByRole('group', { name: 'Open sessions' })).toHaveCount(0);

    await box.fill('cave');
    await expect(
      list.getByRole('group', { name: 'Games' }).getByRole('option'),
    ).toHaveAccessibleName('Cave Diver, 12 plays, 1 likes');
    await expect(list.getByRole('group', { name: 'People' })).toContainText('cavefan');
    await expect(list.getByRole('group', { name: 'Tags' }).getByRole('option')).toHaveText('caves');

    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const person = list.getByRole('option', { name: 'cavefan' });
    await expect(person).toBeFocused();
    await expect(person).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${PLAY}$`));
    await expect(list).toHaveCount(0);
  });

  test('ENTER in the search box runs the search, and a # lands on the tag', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await mockSearch(page);
    await page.goto('/hub');
    const box = page.getByRole('combobox', { name: 'Search games, people, tags…' });

    await box.fill('cave');
    await expect(page.getByRole('option', { name: '#caves' })).toBeVisible();
    await box.press('Enter');
    await expect(page).toHaveURL(/\/hub\?q=cave$/);
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await box.fill('#ca');
    await expect(page.getByRole('option')).toHaveCount(1);
    await box.press('Enter');
    await expect(page).toHaveURL(/\/hub\?tags=caves$/);
  });

  test('a signed-in player joins an open session from the search box', async ({ page }) => {
    await serveGame(page, JOINS_FROM_INIT, {}, room.projectId);
    await mockSignedIn(page);
    await mockSearch(page);
    const entered = await mockRoom(page, room);
    await page.goto('/hub');

    await page.getByRole('combobox', { name: 'Search games, people, tags…' }).click();
    const sessions = page.getByRole('group', { name: 'Open sessions' });
    await sessions
      .getByRole('option', { name: 'Join High Tide, hosted by louis, 2 of 4 players' })
      .click();

    await expect(page).toHaveURL(new RegExp(`/play/${room.projectId}\\?session=room-1$`));

    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.getByRole('alert')).toContainText('in High Tide of louis, 2 of 4');
    expect(entered.joins).toEqual([{ editorTest: false }]);
    await expect(page).toHaveURL(new RegExp(`/play/${room.projectId}$`));
  });

  test('the account popover names the player, links to their profile and signs out', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('naucto.theme', 'dark');
    });
    await mockSignedIn(page);
    await page.route('**/auth/logout', answer(200, {}));
    await page.goto('/hub');

    await page.getByRole('button', { name: 'Account' }).click();
    const menu = page.getByRole('dialog', { name: 'Account' });
    await expect(menu).toContainText('alexis');
    await expect(menu.getByRole('link', { name: 'View profile' })).toHaveAttribute(
      'href',
      '/u/alexis',
    );
    await expect(menu.getByRole('link', { name: 'Profile', exact: true })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings');
    await expect(menu.getByRole('switch')).toHaveCount(0);

    await expect(menu.getByRole('radiogroup')).toHaveCount(0);

    await menu.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  /** The frame is painted from its roles, so the roles are what a browser can be asked about. */
  test('the account avatar is lit from above at rest, and its whole frame takes the active ink under the pointer', async ({
    page,
  }) => {
    await mockSignedIn(page);
    await page.goto('/hub');
    const account = page.getByRole('button', { name: 'Account' });
    const avatar = account.locator('nc-avatar');
    const frame = (): Promise<Record<string, string>> =>
      avatar.evaluate((el) => {
        const style = getComputedStyle(el);
        const ink = document.createElement('i');
        ink.style.color = 'var(--color-active-ink)';
        el.append(ink);
        const active = getComputedStyle(ink).color;
        ink.remove();
        return {
          edge: style.getPropertyValue('--bv-edge'),
          lo: style.getPropertyValue('--bv-lo'),
          shade: style.getPropertyValue('--bv-shade'),
          active,
        };
      });

    await page.mouse.move(0, 0);
    const rest = await frame();
    expect(rest.lo).not.toBe(rest.edge);
    expect(rest.shade).not.toBe('100%');

    await account.hover();
    await expect.poll(async () => (await frame()).edge).toBe(rest.active);
    const lit = await frame();
    expect(lit.lo).toBe(lit.active);
  });

  test('the bell lists what happened, answers a friend request and opens an invite on its session', async ({
    page,
  }) => {
    const at = new Date().toISOString();
    const notification = { userId: uuidOf(1), type: 'INFO', read: false, createdAt: at };
    await serveGame(page, JOINS_FROM_INIT, {}, room.projectId);
    await mockSignedIn(page);
    const entered = await mockRoom(page, room);
    await mockNotifications(page, [
      {
        ...notification,
        id: 'n1',
        kind: 'GENERIC',
        title: 'High Tide',
        message: 'theo invited you to play High Tide',
        data: { projectId: room.projectId, sessionId: 'room-1', joinCode: 'WXYZ' },
      },
      {
        ...notification,
        id: 'n2',
        kind: 'FRIEND_REQUEST',
        title: 'New friend request',
        message: 'lea wants to be your friend',
        data: { requestId: uuidOf(31), fromUserId: uuidOf(21) },
      },
    ]);
    await page.route(
      '**/friends/requests',
      answer(200, [
        {
          id: uuidOf(31),
          from: { id: uuidOf(21), username: 'lea' },
          to: { id: uuidOf(1), username: 'alexis' },
          createdAt: at,
        },
      ]),
    );
    await page.route(`**/friends/requests/${uuidOf(31)}/accept`, answer(201, {}));
    await page.route('**/notifications/*/read', answer(200, {}));
    await page.goto('/hub');

    await page.getByRole('button', { name: 'Notifications, 2 unread' }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel.getByRole('listitem')).toHaveCount(2);

    const accepted = page.waitForRequest(`**/friends/requests/${uuidOf(31)}/accept`);
    await panel.getByRole('button', { name: 'Accept' }).click();
    expect((await accepted).method()).toBe('POST');
    await expect(page.getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible();

    await panel.getByRole('button', { name: /invited you to play High Tide/ }).click();
    await expect(page).toHaveURL(new RegExp(`/play/${room.projectId}\\?session=room-1&code=WXYZ$`));
    await expect(panel).toHaveCount(0);

    // The code of the invitation is what lets the invitee read the session, then into it.
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect(page.getByRole('alert')).toContainText('in High Tide of louis, 2 of 4');
    expect(entered.lookups[0]).toBe('?code=WXYZ');
    expect(entered.joins).toEqual([{ joinCode: 'WXYZ', editorTest: false }]);
    await expect(page).toHaveURL(new RegExp(`/play/${room.projectId}$`));
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

  test('Settings, Controls seats each gamepad as a player and trades two seats', async ({
    page,
  }) => {
    await mockSignedIn(page);
    await setGamepads(page, [{ id: 'First Pad' }, { id: 'Second Pad (Vendor: 0000)' }]);
    await page.goto('/settings/controls');

    const controls = page.locator('nc-controls');
    const cards = controls.locator('article');
    await expect(cards).toHaveText([/P1\s*First Pad/, /P2\s*Second Pad$/, /P3 open/, /Size/]);
    await expect(controls.getByText('connected')).toHaveCount(0);

    await controls.getByRole('button', { name: 'Plays as player 2' }).click();
    const seats = page.getByRole('menu').getByRole('menuitemradio');
    await expect(seats).toHaveText([
      /P1\s*First Pad\s*Swap/,
      /P2\s*This gamepad/,
      /P3\s*Free/,
      /P4\s*Free/,
    ]);
    await expect(seats.nth(1)).toHaveAttribute('aria-checked', 'true');
    await seats.first().click();

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(cards.first()).toHaveText(/P1\s*Second Pad$/);
    await expect(cards.nth(1)).toHaveText(/P2\s*First Pad/);
    // The first player's badge is gold, the second's sky.
    const fill = (name: string): Promise<string> =>
      controls
        .getByRole('button', { name })
        .evaluate((el) => getComputedStyle(el).getPropertyValue('--bv-fill'));
    expect(await fill('Plays as player 1')).toBe('rgb(255, 209, 0)');
    expect(await fill('Plays as player 2')).toBe('rgb(104, 174, 212)');
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('Settings, Controls fits four gamepads and the touch pad without scrolling sideways', async ({
      page,
    }) => {
      await mockSignedIn(page);
      await setGamepads(
        page,
        ['One', 'Two', 'Three', 'Four'].map((id) => ({ id })),
      );
      await page.goto('/settings/controls');
      await expect(page.locator('nc-controls nc-pad-art')).toHaveCount(4);
      await expect(page.locator('nc-controls nc-pad-preview')).toBeVisible();

      const overflow = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
      for (const art of await page.locator('nc-pad-art').all()) {
        const box = await art.boundingBox();
        expect(box?.width).toBe(279);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
      }
    });

    test('the touch pad preview holds every key at the largest size, none on another', async ({
      page,
    }) => {
      await page.addInitScript(() => {
        localStorage.setItem('naucto.pad-layout', JSON.stringify({ size: 140, opacity: 85 }));
      });
      await mockSignedIn(page);
      await page.goto('/settings/controls');

      const preview = page.locator('nc-controls nc-pad-preview');
      const keys = preview.locator('[data-nc-control]');
      await expect(keys).toHaveCount(9);
      const frame = await preview.evaluate(
        (element) => element.getBoundingClientRect().toJSON() as DOMRect,
      );
      const boxes = await keys.evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().toJSON() as DOMRect),
      );
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(frame.left);
        expect(box.right).toBeLessThanOrEqual(frame.right);
        expect(box.top).toBeGreaterThanOrEqual(frame.top);
        expect(box.bottom).toBeLessThanOrEqual(frame.bottom);
      }
      const apart = (a: DOMRect, b: DOMRect): boolean =>
        a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
      for (const [i, box] of boxes.entries()) {
        for (const other of boxes.slice(i + 1)) {
          expect(apart(box, other)).toBe(true);
        }
      }
      // A legend is never squeezed: at this width no key is large enough to hold one.
      await expect(preview.locator('nc-mark')).toHaveCount(0);
    });
  });
});
