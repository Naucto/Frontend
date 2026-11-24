import { glyphPath } from '../packages/ui/src/icons/glyph-path';
import { ICON_GLYPHS } from '../packages/ui/src/icons/glyphs';
import { expect, type Page, test } from './fixtures';
import { ALEXIS, by, collection, mockCollections } from './mocks/collections';
import { serveGame } from './mocks/game';
import { hubGame, mockHub, mockProjects } from './mocks/hub';
import {
  mockComments,
  mockFlags,
  mockModeration,
  mockStanding,
  SUSPENSION,
} from './mocks/moderation';
import { mockNotifications } from './mocks/notifications';
import { answer, mockSignedIn } from './mocks/session';

const comment = (id: number, over: Record<string, unknown>): Record<string, unknown> => ({
  id,
  content: 'Loved the third cave.',
  createdAt: '2026-11-22T10:00:00.000Z',
  projectId: 42,
  author: { id: 21, username: 'lea' },
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
    await mockComments(page, 42, []);
    const sent = await mockFlags(page);
    await page.goto('/play/42');

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
        targetId: 42,
        reason: 'STOLEN_CONTENT',
        details: 'Sprites of Hightide',
      },
    ]);
  });

  test('deleting a comment asks first, and Cancel sends nothing', async ({ page }) => {
    await serveGame(page, 'function _draw() gfx.cls(1) end');
    await mockSignedIn(page);
    await mockComments(page, 42, [comment(3, { author: { id: 1, username: 'alexis' } })]);
    const deleted: string[] = [];
    await page.route('**/projects/42/comments/*', (route) => {
      if (route.request().method() === 'DELETE') {
        deleted.push(route.request().url());
        return route.fulfill({ status: 204 });
      }
      return route.fallback();
    });
    await page.goto('/play/42');

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
    await mockComments(page, 42, [
      comment(3, {}),
      comment(2, { content: '', deleted: true, removedBy: 'MODERATION' }),
      comment(1, { content: '', deleted: true, removedBy: 'USER' }),
    ]);
    await page.route(
      '**/users/public/username/ada**',
      answer(200, { statusCode: 200, message: '', data: { id: 7, username: 'ada' } }),
    );
    await page.goto('/play/42');

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
      '**/projects/releases/42',
      answer(403, { statusCode: 403, code: 'PROJECT_HIDDEN', message: 'Hidden' }),
    );
    await page.goto('/play/42');

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
      collections: [collection('couch', 'Couch co-op', { gameIds: [11] })],
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

  test('a moderation notification carries its own glyph and leads to Standing', async ({
    page,
  }) => {
    await mockQuietHub(page);
    await mockSignedIn(page);
    await mockStanding(page);
    await mockNotifications(page, [
      {
        id: 'n1',
        userId: 1,
        type: 'WARNING',
        kind: 'MODERATION',
        title: 'Your game Neon Drift was hidden',
        message: 'The sprites are taken from another game on the hub.',
        data: { actionId: 11, action: 'PROJECT_HIDDEN' },
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
