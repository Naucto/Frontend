import { uuidOf } from '../packages/api-client/testing';
import { glyphPath } from '../packages/ui/src/icons/glyph-path';
import { ICON_GLYPHS } from '../packages/ui/src/icons/glyphs';
import { editorUrl, mockEditor, projectRoute } from './editor-mocks';
import { expect, type Page, test } from './fixtures';
import { ADA, ALEXIS, by, collection, mockCollections } from './mocks/collections';
import { PLAY, release, serveGame } from './mocks/game';
import { FEED, hubGame, mockHub, mockProjects } from './mocks/hub';
import {
  mockComments,
  mockFlags,
  mockModeration,
  mockStanding,
  SUSPENSION,
} from './mocks/moderation';
import { mockNotifications } from './mocks/notifications';
import { answer, mockSignedIn } from './mocks/session';

const comment = (number: number, over: Record<string, unknown>): Record<string, unknown> => ({
  id: uuidOf(number),
  content: 'Loved the third cave.',
  createdAt: '2026-11-22T10:00:00.000Z',
  projectId: release.id,
  author: { id: uuidOf(21), username: 'lea' },
  deleted: false,
  replies: [],
  ...over,
});

/** The hub of a signed-in reader with no game of their own and nobody playing. */
async function mockQuietHub(page: Page): Promise<void> {
  await mockHub(page);
  await mockProjects(page);
  await page.route('**/game-sessions', answer(200, { sessions: [] }));
}

test.describe('moderation', () => {
  test.beforeEach(async ({ page }) => {
    await mockModeration(page);
  });

  test('a reader reports a game: one reason, what they add, and the moderators get both', async ({
    page,
  }) => {
    await serveGame(page, 'function _draw() gfx.cls(1) end');
    await mockSignedIn(page);
    await mockComments(page, release.id, []);
    const sent = await mockFlags(page);
    await page.goto(PLAY);

    await page.getByRole('button', { name: 'Report game' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report this game' });
    await expect(dialog.getByText('Cave Diver')).toBeVisible();
    const send = dialog.getByRole('button', { name: 'Send report' });
    await expect(send).toBeDisabled();

    const reason = dialog.getByRole('combobox', { name: 'What is wrong with it?' });
    await reason.click();
    await page.getByRole('option', { name: 'Spam or advertising' }).click();
    await reason.click();
    await page.getByRole('option', { name: 'Stolen work' }).click();
    await expect(reason).toContainText('Stolen work');
    await dialog.getByLabel('Anything the moderators should know').fill('  Sprites of Hightide ');
    await expect(dialog.getByText('22 of 1000')).toBeVisible();
    await send.click();

    await expect(dialog).toHaveCount(0);
    await expect(page.locator('nc-toast-host')).toContainText('Your report reached the moderators');
    expect(sent).toEqual([
      {
        targetType: 'PROJECT',
        targetId: release.id,
        reason: 'STOLEN_CONTENT',
        details: 'Sprites of Hightide',
      },
    ]);
  });

  test('deleting a comment asks first, and Cancel sends nothing', async ({ page }) => {
    await serveGame(page, 'function _draw() gfx.cls(1) end');
    await mockSignedIn(page);
    await mockComments(page, release.id, [
      comment(3, { author: { id: uuidOf(1), username: 'alexis' } }),
    ]);
    const deleted: string[] = [];
    await page.route(`**/projects/${release.id}/comments/*`, (route) => {
      if (route.request().method() === 'DELETE') {
        deleted.push(route.request().url());
        return route.fulfill({ status: 204 });
      }
      return route.fallback();
    });
    await page.goto(PLAY);

    const thread = page.locator('nc-comments');
    await thread.getByRole('button', { name: 'Delete' }).click();
    const confirm = page.getByRole('dialog').filter({ hasText: 'Delete this comment?' });
    await confirm.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirm).toHaveCount(0);
    expect(deleted).toEqual([]);

    await thread.getByRole('button', { name: 'Delete' }).click();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => deleted.length).toBe(1);
  });

  test('Report is one control on a game, a profile and a comment, and never on a removed one', async ({
    page,
  }) => {
    await serveGame(page, 'function _draw() gfx.cls(1) end');
    await mockSignedIn(page);
    await mockComments(page, release.id, [
      comment(3, {}),
      comment(2, { content: '', deleted: true, removedBy: 'MODERATION' }),
      comment(1, { content: '', deleted: true, removedBy: 'USER' }),
    ]);
    await page.route(
      '**/users/public/username/ada**',
      answer(200, { statusCode: 200, message: '', data: { id: uuidOf(7), username: 'ada' } }),
    );
    await page.goto(PLAY);

    const thread = page.locator('nc-comments').getByRole('listitem');
    await expect(thread).toHaveCount(3);
    for (const report of [
      page.getByRole('button', { name: 'Report game' }),
      thread.nth(0).getByRole('button', { name: 'Report' }),
    ]) {
      await expect(report).toHaveAttribute('data-variant', 'ghost');
      await expect(report.locator('nc-mark')).toHaveCount(1);
    }

    const removed = thread.nth(1);
    await expect(removed.getByTestId('comment-moderated')).toHaveText(
      'A moderator removed this comment.',
    );
    await expect(removed.getByRole('button', { name: 'Report' })).toHaveCount(0);
    await expect(thread.nth(2)).toContainText('[deleted]');
    await expect(thread.nth(2).getByTestId('comment-moderated')).toHaveCount(0);

    await page.goto('/u/ada');
    const profile = page.getByRole('button', { name: 'Report profile' });
    await expect(profile).toHaveAttribute('data-variant', 'ghost');
    await expect(profile.locator('nc-mark')).toHaveCount(1);
  });

  test('a game a moderator hid answers its page as unavailable', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await page.route(
      `**/projects/releases/${release.id}`,
      answer(403, { statusCode: 403, code: 'PROJECT_HIDDEN', message: 'Hidden' }),
    );
    await page.goto(PLAY);

    const state = page.locator('nc-error-state');
    await expect(state.getByRole('heading', { name: 'This game is unavailable' })).toBeVisible();
    await expect(state).toContainText('A moderator took it off Naucto.');
    await expect(state.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  });

  test('Standing lists the suspension, the warning and every decision, a page at a time', async ({
    page,
  }) => {
    await mockSignedIn(page, { suspension: SUSPENSION });
    const asked = await mockStanding(page, {
      suspension: { ...SUSPENSION, reason: 'HARASSMENT', message: 'Third time this week.' },
      warnings: 1,
    });
    await page.goto('/settings/standing');

    const panel = page.getByRole('tabpanel');
    await expect(panel.locator('nc-notice')).toContainText(
      /Your account is suspended until Dec 4, 2026, /,
    );
    await expect(panel.locator('nc-notice')).toContainText('Third time this week.');
    await expect(panel.getByText('1 warning', { exact: true })).toBeVisible();

    const rows = panel.getByRole('table').locator('tbody tr');
    await expect(rows).toHaveCount(10);
    await expect(rows.nth(0).getByRole('rowheader')).toHaveText('Account suspended');
    await expect(rows.nth(0)).toContainText('Harassment or bullying');
    await expect(rows.nth(0)).toContainText(/Until Dec 4, 2026, /);
    await expect(rows.nth(1).getByRole('rowheader')).toHaveText('Warning');
    await expect(rows.nth(2).getByRole('rowheader')).toContainText('Neon Drift');
    await expect(rows.nth(2)).toContainText('The sprites are taken from another game on the hub.');

    const pager = panel.locator('nc-pager');
    await expect(pager.getByRole('tab')).toHaveCount(2);
    await expect(panel).not.toContainText('1 / 2');
    await pager.getByRole('button', { name: 'Older' }).click();
    await expect(rows).toHaveCount(3);
    await expect(pager.getByRole('tab', { name: 'Page 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(asked).toEqual(['?page=1&limit=10', '?page=2&limit=10']);
  });

  test('the suspension band stands under the bar on every page, the hub included, and leads to Standing', async ({
    page,
  }) => {
    await mockQuietHub(page);
    await mockSignedIn(page, { suspension: SUSPENSION });
    await mockStanding(page);
    await page.setViewportSize({ width: 1280, height: 800 });

    const band = page.getByTestId('suspension-band');
    await page.goto('/hub');
    await expect(page.locator('nc-hero-pile')).toBeVisible();
    await expect(band).toContainText(/Your account is suspended until Dec 4, 2026, /);

    // The hub paints a backdrop over the whole window. What is painted on top at a point is
    // what a pointer finds there, so the backdrop is made to take the pointer for the question.
    const covered = await band.evaluate((painted) => {
      const backdrop = document.querySelector<HTMLElement>('nc-dither-backdrop');
      if (!backdrop) {
        throw new Error('The hub has no backdrop');
      }
      backdrop.style.pointerEvents = 'auto';
      const { left, top, width, height } = painted.getBoundingClientRect();
      const points = [0.02, 0.5, 0.98].flatMap((across) =>
        [0.1, 0.5, 0.9].map((down) => [left + width * across, top + height * down] as const),
      );
      const hidden = points.filter(([x, y]) => !painted.contains(document.elementFromPoint(x, y)));
      backdrop.style.pointerEvents = '';
      return hidden.length;
    });
    expect(covered).toBe(0);

    await page.getByTestId('suspension-band').getByRole('link', { name: 'See why' }).click();
    await expect(page).toHaveURL(/\/settings\/standing$/);
    await expect(page.getByRole('tab', { name: 'Standing' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('a suspended account is told why its collection stays as it is, and nothing is sent', async ({
    page,
  }) => {
    const api = await mockCollections(page, [hubGame(11, 'Hightide')], {
      collections: [collection('couch', 'Couch co-op', { gameIds: [uuidOf(11)] })],
      viewer: ALEXIS.id,
    });
    await mockSignedIn(page, { ...ALEXIS, suspension: SUSPENSION });
    await page.goto('/collections/couch');

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('nc-toast-host')).toContainText(
      'Your account is suspended, so this is not available for now.',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(api.calls.filter((call) => call.method !== 'GET')).toEqual([]);
  });

  test('My games marks the game a moderator hid', async ({ page }) => {
    const api = await mockCollections(page, []);
    await mockSignedIn(page, ALEXIS);
    api.viewer = ALEXIS.id;
    const projects = [
      hubGame(201, 'Pong Royale', { ...by(ALEXIS), hiddenAt: null }),
      hubGame(202, 'Neon Drift', { ...by(ALEXIS), hiddenAt: '2026-11-18T16:05:00.000Z' }),
    ];
    await mockProjects(page, projects);
    await page.goto('/games');

    const shelf = page.getByTestId('shelf-published');
    await expect(shelf.getByRole('link', { name: 'Neon Drift' }).locator('nc-chip')).toHaveText(
      'Hidden',
    );
    await expect(shelf.getByRole('link', { name: 'Pong Royale' }).locator('nc-chip')).toHaveCount(
      0,
    );
  });

  test('a reader reports a collection, and its owner is offered no Report', async ({ page }) => {
    const sent = await mockFlags(page);
    const api = await mockCollections(page, [hubGame(11, 'Hightide')], {
      collections: [collection('couch', 'Couch co-op', { owner: ADA, gameIds: [uuidOf(11)] })],
    });
    await mockSignedIn(page, ALEXIS);
    api.viewer = ALEXIS.id;
    await page.goto('/collections/couch');

    const report = page.getByRole('button', { name: 'Report collection' });
    // The game page's own treatment: a ghost button of 30 with the flag mark, and no frame.
    await expect(report.locator('nc-mark')).toHaveCount(1);
    expect((await report.boundingBox())?.height).toBe(30);
    await report.click();
    const dialog = page.getByRole('dialog', { name: 'Report this collection' });
    await expect(dialog).toContainText('Couch co-op');
    await dialog.getByRole('switch', { name: 'Spam or advertising' }).click();
    await dialog.getByRole('button', { name: 'Send report' }).click();

    await expect(page.locator('nc-toast-host')).toContainText('Your report reached the moderators');
    expect(sent).toEqual([{ targetType: 'COLLECTION', targetId: 'couch', reason: 'SPAM' }]);

    // Its owner has nothing to report about it.
    api.collections[0] = collection('couch', 'Couch co-op', { gameIds: [uuidOf(11)] });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Couch co-op' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Report collection' })).toHaveCount(0);
  });

  test('a suspended reader is told why the report of a collection does not open', async ({
    page,
  }) => {
    const sent = await mockFlags(page);
    const api = await mockCollections(page, [hubGame(11, 'Hightide')], {
      collections: [collection('couch', 'Couch co-op', { owner: ADA, gameIds: [uuidOf(11)] })],
    });
    await mockSignedIn(page, { ...ALEXIS, suspension: SUSPENSION });
    api.viewer = ALEXIS.id;
    await page.goto('/collections/couch');

    await page.getByRole('button', { name: 'Report collection' }).click();

    await expect(page.locator('nc-toast-host')).toContainText(
      'Your account is suspended, so this is not available for now.',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(sent).toEqual([]);
  });

  test.describe('a collection a moderator hid', () => {
    const hidden = (): ReturnType<typeof collection> =>
      collection('couch', 'Couch co-op', {
        gameIds: [uuidOf(11), uuidOf(12)],
        hiddenAt: '2026-11-18T16:05:00.000Z',
      });
    const games = [hubGame(11, 'Hightide'), hubGame(12, 'Pong Royale')];

    test('tells its owner so, closes what would change it, and still lets a game out', async ({
      page,
    }) => {
      const api = await mockCollections(page, games, { collections: [hidden()] });
      await mockSignedIn(page, ALEXIS);
      api.viewer = ALEXIS.id;
      await mockStanding(page);
      await page.goto('/collections/couch');

      const notice = page.getByTestId('collection-hidden-notice');
      await expect(notice).toContainText('A moderator hid this collection.');
      await expect(page.locator('nc-chip', { hasText: 'Hidden' })).toHaveCount(1);
      await expect(page.locator('nc-visibility-chip')).toHaveCount(0);
      // Nobody else can open it, so there is no link to hand on, and nothing to report.
      await expect(page.getByTestId('copy-link')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Report collection' })).toHaveCount(0);

      const edit = page.getByRole('button', { name: 'Edit' });
      await expect(edit).toBeDisabled();
      await expect(edit).toHaveAttribute('title', 'Blocked: a moderator hid this collection');
      await page.getByRole('switch', { name: 'Organize' }).click();
      await expect(page.getByRole('button', { name: 'Move Hightide later' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Move Pong Royale earlier' })).toBeDisabled();

      await page.getByRole('checkbox', { name: 'Select Hightide' }).click();
      await page.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect.poll(() => api.collections[0]?.gameIds).toEqual([uuidOf(12)]);
      expect(api.calls.filter((call) => !['GET', 'DELETE'].includes(call.method))).toEqual([]);

      await notice.getByRole('link', { name: 'See why' }).click();
      await expect(page).toHaveURL(/\/settings\/standing$/);
    });

    test("is still its owner's to delete", async ({ page }) => {
      const api = await mockCollections(page, games, { collections: [hidden()] });
      await mockSignedIn(page, ALEXIS);
      api.viewer = ALEXIS.id;
      await mockProjects(page);
      await page.goto('/collections/couch');

      await page.getByRole('button', { name: 'Delete' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();

      await expect(page).toHaveURL(/\/games$/);
      expect(api.collections).toEqual([]);
    });

    test('is not found by anyone else, signed in or not', async ({ page }) => {
      const api = await mockCollections(page, games, { collections: [hidden()] });
      await mockSignedIn(page, ADA);
      api.viewer = ADA.id;
      await page.goto('/collections/couch');

      await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
      await expect(page.getByTestId('collection-hidden-notice')).toHaveCount(0);
    });

    test('is marked Hidden on My games, in the place of who can open it', async ({ page }) => {
      const api = await mockCollections(page, games, {
        collections: [hidden(), collection('later', 'To try later', { visibility: 'PRIVATE' })],
      });
      await mockSignedIn(page, ALEXIS);
      api.viewer = ALEXIS.id;
      await mockProjects(page);
      await page.goto('/games');

      const shelf = page.getByTestId('shelf-collections');
      const couch = shelf.locator('nc-collection-box').filter({ hasText: 'Couch co-op' });
      await expect(couch.getByTestId('collection-hidden')).toHaveText('Hidden');
      await expect(couch.locator('nc-visibility-chip')).toHaveCount(0);
      const later = shelf.locator('nc-collection-box').filter({ hasText: 'To try later' });
      await expect(later.getByTestId('collection-hidden')).toHaveCount(0);
      await expect(later.locator('nc-visibility-chip')).toHaveText('Private');
    });

    test('takes no new game from the checklist of a game page, and says why', async ({ page }) => {
      await serveGame(page, 'function _update() end');
      const api = await mockCollections(page, games, {
        collections: [hidden(), collection('later', 'To try later', { visibility: 'PRIVATE' })],
      });
      await mockSignedIn(page, ALEXIS);
      api.viewer = ALEXIS.id;
      await page.goto(PLAY);

      await page.getByTestId('add-to-collection').click();
      const list = page.getByRole('dialog', { name: 'Add to collection' });
      const couch = list.getByRole('checkbox', { name: 'Couch co-op' });
      await expect(couch).toContainText('Hidden');
      await expect(couch).toBeDisabled();
      await expect(list.locator('nc-checkbox').filter({ hasText: 'Couch co-op' })).toHaveAttribute(
        'title',
        'Blocked: a moderator hid this collection',
      );

      // The reader's own game that moderation withholds: no collection takes it, and it says so.
      api.hiddenGames = [release.id];
      await list.getByRole('checkbox', { name: 'To try later' }).click();
      await expect(page.locator('nc-toast-host')).toContainText(
        'A moderator hid this game, so no collection takes it until it is restored.',
      );
      await expect(list.getByRole('checkbox', { name: 'To try later' })).not.toBeChecked();
    });
  });

  test("the hub marks the reader's own hidden game on the Continue card", async ({ page }) => {
    const mine = { userId: uuidOf(1), creator: { id: uuidOf(1), username: 'alexis' } };
    await mockSignedIn(page);
    await mockHub(page, {
      feed: {
        ...FEED,
        hero: [
          {
            reason: 'CONTINUE',
            game: hubGame(4, 'Cave Diver', { ...mine, hiddenAt: '2026-11-18T16:05:00.000Z' }),
          },
          { reason: 'TRENDING', game: hubGame(2, 'Neon Drift') },
        ],
      },
    });
    await mockProjects(page);
    await page.route('**/game-sessions**', answer(200, { sessions: [] }));
    await page.goto('/hub');

    const hero = page.locator('nc-hero-pile');
    await expect(
      hero.getByRole('button', { name: 'Play Cave Diver' }).locator('nc-chip'),
    ).toHaveText('Hidden');
    await expect(
      hero.getByRole('button', { name: 'Show Neon Drift' }).locator('nc-chip'),
    ).toHaveCount(0);
  });

  test('the Disk tab of a game a moderator hid says why it is closed, and sends nothing', async ({
    page,
  }) => {
    const writes: string[] = [];
    const stored = await mockEditor(page);
    Object.assign(stored, { hiddenAt: '2026-11-18T16:05:00.000Z' });
    await page.route(projectRoute('disk'), (route) => {
      writes.push(route.request().method());
      return route.fulfill({ status: 403, json: { code: 'PROJECT_HIDDEN', message: 'Hidden' } });
    });
    await page.goto(editorUrl('game'));
    await page.getByRole('tablist', { name: 'Game' }).getByRole('tab', { name: 'Disk' }).click();

    const notice = page.getByTestId('disk-hidden-notice');
    await expect(notice).toContainText('A moderator hid this game, so its disk stays as it is');
    await expect(notice.getByRole('link', { name: 'See why' })).toHaveAttribute(
      'href',
      '/settings/standing',
    );
    for (const finish of await page
      .getByRole('group', { name: 'Finish' })
      .getByRole('button')
      .all()) {
      await expect(finish).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: /^Body colour \d+$/ }).first()).toBeDisabled();
    // The other views of the tab are the author's as before: only the disk is refused.
    await page.getByRole('tablist', { name: 'Game' }).getByRole('tab', { name: 'Details' }).click();
    await expect(page.getByRole('textbox', { name: 'Name' })).toBeEnabled();
    expect(writes).toEqual([]);
  });

  test('a disk refused because the game was hidden meanwhile says why and closes the bench', async ({
    page,
  }) => {
    const stored = await mockEditor(page);
    await page.route(projectRoute('disk'), (route) => {
      Object.assign(stored, { hiddenAt: '2026-11-18T16:05:00.000Z' });
      return route.fulfill({ status: 403, json: { code: 'PROJECT_HIDDEN', message: 'Hidden' } });
    });
    await page.goto(editorUrl('game'));
    await page.getByRole('tablist', { name: 'Game' }).getByRole('tab', { name: 'Disk' }).click();

    await page
      .getByRole('group', { name: 'Finish' })
      .getByRole('button', { name: 'Stripes' })
      .click();

    await expect(page.locator('nc-toast-host')).toContainText(
      'A moderator hid this game, so its disk stays as it is until the game is restored.',
    );
    await expect(page.getByTestId('disk-hidden-notice')).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Finish' }).getByRole('button', { name: 'Stripes' }),
    ).toBeDisabled();
  });

  test('a moderation notification about a collection leads to Standing as well', async ({
    page,
  }) => {
    await mockQuietHub(page);
    await mockSignedIn(page);
    await mockStanding(page);
    await mockNotifications(page, [
      {
        id: uuidOf(71),
        userId: uuidOf(1),
        type: 'WARNING',
        kind: 'MODERATION',
        title: 'Your collection Couch co-op was hidden',
        message: 'It lists games taken from other people.',
        data: { actionId: uuidOf(12), action: 'COLLECTION_HIDDEN', collectionId: 'couch' },
        read: false,
        createdAt: new Date().toISOString(),
      },
    ]);
    await page.route('**/notifications/*/read', answer(200, {}));
    await page.goto('/hub');

    await page.getByRole('button', { name: 'Notifications, 1 unread' }).click();
    await page
      .getByRole('dialog', { name: 'Notifications' })
      .getByRole('button', { name: /Your collection Couch co-op was hidden/ })
      .click();

    await expect(page).toHaveURL(/\/settings\/standing$/);
  });

  test('a moderation notification carries its own glyph and leads to Standing', async ({
    page,
  }) => {
    await mockQuietHub(page);
    await mockSignedIn(page);
    await mockStanding(page);
    await mockNotifications(page, [
      {
        id: 'n1',
        userId: uuidOf(1),
        type: 'WARNING',
        kind: 'MODERATION',
        title: 'Your game Neon Drift was hidden',
        message: 'The sprites are taken from another game on the hub.',
        data: { actionId: uuidOf(11), action: 'PROJECT_HIDDEN' },
        read: false,
        createdAt: new Date().toISOString(),
      },
    ]);
    await page.route('**/notifications/*/read', answer(200, {}));
    await page.goto('/hub');

    await page.getByRole('button', { name: 'Notifications, 1 unread' }).click();
    const row = page
      .getByRole('dialog', { name: 'Notifications' })
      .getByRole('button', { name: /Your game Neon Drift was hidden/ });
    await expect(row.locator('nc-icon path')).toHaveAttribute(
      'd',
      glyphPath(ICON_GLYPHS[18].flag, 6),
    );
    await row.click();

    await expect(page).toHaveURL(/\/settings\/standing$/);
    await expect(page.getByRole('heading', { name: 'Decisions' })).toBeVisible();
  });
});
