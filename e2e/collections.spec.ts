import { expect, type Locator, type Page, test } from './fixtures';
import {
  ADA,
  ALEXIS,
  by,
  collection,
  type CollectionsApi,
  mockCollections,
} from './mocks/collections';
import { release } from './mocks/game';
import { hubGame, mockProjects } from './mocks/hub';
import { answer, mockSignedIn } from './mocks/session';

const GAMES = [
  hubGame(11, 'Hightide'),
  hubGame(12, 'Pong Royale', by(ALEXIS)),
  hubGame(13, 'Frog Hop'),
  hubGame(14, 'Night Courier', by(ALEXIS)),
  hubGame(42, 'Cave Diver'),
];

const couch = (): ReturnType<typeof collection> =>
  collection('couch', 'Couch co-op', {
    description: 'Two pads, one sofa.',
    gameIds: [11, 12, 13, 14],
  });

/** The four of the tray's disks, by the name on each, in the order they stand. */
const tray = (page: Page): Locator => page.getByTestId('tray').getByRole('link');
const names = (disks: Locator): Promise<(string | null)[]> =>
  disks.evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')));

async function asAlexis(page: Page, api: CollectionsApi): Promise<void> {
  await mockSignedIn(page, ALEXIS);
  api.viewer = ALEXIS.id;
}

const project = (id: number, name: string, published: boolean): Record<string, unknown> =>
  hubGame(id, name, { ...by(ALEXIS), ...(published ? {} : { publishedAt: null }) });

test.describe('a collection page', () => {
  test('shows a reader the box, its games in order, and a link to hand on', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.route('**/auth/refresh', answer(401, {}));
    await mockCollections(page, GAMES, { collections: [couch()] });
    await page.goto('/collections/couch');

    await expect(page.getByRole('heading', { level: 1, name: 'Couch co-op' })).toBeVisible();
    await expect(page.getByText('Two pads, one sofa.')).toBeVisible();
    await expect(page.locator('nc-visibility-chip')).toHaveText('Public');
    await expect(page.getByRole('link', { name: 'by alexis' })).toHaveAttribute(
      'href',
      '/u/alexis',
    );
    await expect(page.getByTestId('game-count')).toContainText('4');
    expect(await names(tray(page))).toEqual([
      'Hightide',
      'Pong Royale',
      'Frog Hop',
      'Night Courier',
    ]);
    await expect(tray(page).first()).toHaveAttribute('href', '/play/11');
    await expect(page.getByTestId('tray').locator('li').nth(2)).toContainText('03');

    await expect(page.getByRole('switch', { name: 'Organize' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);

    await page.getByTestId('copy-link').click();
    await expect(page.getByTestId('copy-link')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `${new URL(page.url()).origin}/collections/couch`,
    );
  });

  test('keeps a long title on one line', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await mockCollections(page, GAMES, {
      collections: [collection('jam', 'Everything we loved at the 2026 game jam')],
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/collections/jam');

    const title = page.getByRole('heading', { level: 1 });
    await expect(title).toBeVisible();
    const box = await title.boundingBox();
    expect(box?.height).toBeLessThan(40);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });

  test('answers not-found for a private collection to anyone but its owner', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    const api = await mockCollections(page, GAMES, {
      collections: [collection('secret', 'To try later', { visibility: 'PRIVATE', gameIds: [11] })],
    });
    await page.goto('/collections/secret');
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();
    await expect(page.getByText('To try later')).toHaveCount(0);

    await page.goto('/collections/no-such-one');
    await expect(page.getByRole('heading', { name: 'Nothing here' })).toBeVisible();

    await asAlexis(page, api);
    await page.goto('/collections/secret');
    await expect(page.getByRole('heading', { level: 1, name: 'To try later' })).toBeVisible();
    await expect(page.locator('nc-visibility-chip')).toHaveText('Private');
    await expect(page.getByTestId('copy-link')).toHaveCount(0);
  });

  test('lets its owner move disks from the keyboard, and take out the ones ticked', async ({
    page,
  }) => {
    const api = await mockCollections(page, GAMES, { collections: [couch()] });
    await asAlexis(page, api);
    await page.goto('/collections/couch');

    await expect(page.getByRole('button', { name: 'Move Frog Hop later' })).toHaveCount(0);
    await page.getByRole('switch', { name: 'Organize' }).click();

    const later = page.getByRole('button', { name: 'Move Frog Hop later' });
    await expect(page.getByRole('button', { name: 'Move Hightide earlier' })).toBeDisabled();
    await later.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => names(tray(page)))
      .toEqual(['Hightide', 'Pong Royale', 'Night Courier', 'Frog Hop']);
    await expect(page.locator('[aria-live="polite"]').filter({ hasText: 'Frog Hop' })).toHaveText(
      'Frog Hop is now 4 of 4',
    );
    // At the end of the tray its own arrow is out of use: the focus goes to the other one.
    await expect(page.getByRole('button', { name: 'Move Frog Hop earlier' })).toBeFocused();
    // Twice in a row, faster than the tray is drawn again: both presses are this disk's.
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => names(tray(page)))
      .toEqual(['Hightide', 'Frog Hop', 'Pong Royale', 'Night Courier']);
    await expect(page.getByRole('button', { name: 'Move Frog Hop earlier' })).toBeFocused();
    await expect.poll(() => api.collections[0]?.gameIds).toEqual([11, 13, 12, 14]);
    expect(api.calls.filter((call) => call.method === 'PUT').at(-1)).toMatchObject({
      path: '/collections/couch/games',
      body: { projectIds: [11, 13, 12, 14] },
    });

    const remove = page.getByRole('button', { name: 'Remove', exact: true });
    await expect(remove).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Select Hightide' }).click();
    await page.getByRole('checkbox', { name: 'Select Night Courier' }).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await remove.click();
    await expect.poll(() => names(tray(page))).toEqual(['Frog Hop', 'Pong Royale']);
    await expect(page.getByTestId('game-count')).toContainText('2');
    await expect(page.getByText('0 selected')).toBeVisible();

    // Reloaded, the order is the one the server was given.
    await page.reload();
    await expect.poll(() => names(tray(page))).toEqual(['Frog Hop', 'Pong Royale']);
  });

  test('moves a disk under a drag', async ({ page }) => {
    const api = await mockCollections(page, GAMES, { collections: [couch()] });
    await asAlexis(page, api);
    await page.goto('/collections/couch');
    await page.getByRole('switch', { name: 'Organize' }).click();

    const cells = page.getByTestId('tray').locator('li');
    const from = await cells.nth(0).boundingBox();
    const to = await cells.nth(2).boundingBox();
    if (!from || !to) {
      throw new Error('The tray is not laid out.');
    }
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
    await page.mouse.up();

    await expect.poll(() => api.collections[0]?.gameIds).toEqual([12, 13, 11, 14]);
    expect(await names(tray(page))).toEqual([
      'Pong Royale',
      'Frog Hop',
      'Hightide',
      'Night Courier',
    ]);
  });

  test('shows its owner the games that left the hub, to take out', async ({ page }) => {
    const api = await mockCollections(page, GAMES, {
      collections: [collection('couch', 'Couch co-op', { gameIds: [11], unavailable: [90, 91] })],
    });
    await asAlexis(page, api);
    await page.goto('/collections/couch');

    const gone = page.getByRole('region', { name: 'No longer on the hub' });
    await expect(gone.locator('nc-chip')).toHaveText('2');
    await expect(gone.getByRole('img', { name: 'A game that left the hub' })).toHaveCount(2);
    await gone.getByRole('button', { name: 'Remove' }).first().click();
    await expect(gone.getByRole('img')).toHaveCount(1);
    expect(api.calls.at(-2)).toMatchObject({
      method: 'DELETE',
      path: '/collections/couch/games/90',
    });

    // Nobody else is told about them.
    api.viewer = null;
    await page.route('**/auth/refresh', answer(401, {}));
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Couch co-op' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'No longer on the hub' })).toHaveCount(0);
  });
});

test.describe('creating, editing and deleting', () => {
  test('a collection is born private from My games, then edited and deleted on its page', async ({
    page,
  }) => {
    const api = await mockCollections(page, GAMES, { collections: [couch()] });
    await asAlexis(page, api);
    await mockProjects(page);
    await page.goto('/games');

    await page.getByTestId('new-collection').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'New collection' })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Private' })).toBeChecked();
    await expect(dialog.getByTestId('visibility-hint')).toHaveText('Only you can see it.');
    await expect(dialog.getByRole('button', { name: 'Create' })).toBeDisabled();
    await dialog.getByLabel('Title').fill('Late night picks');
    await dialog.getByLabel('Description').fill('For after midnight.');
    await dialog.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/collections\/new-1$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Late night picks' })).toBeVisible();
    await expect(page.locator('nc-visibility-chip')).toHaveText('Private');
    await expect(page.getByRole('heading', { name: 'No disk in this box yet' })).toBeVisible();
    expect(api.calls.find((call) => call.method === 'POST')?.body).toEqual({
      title: 'Late night picks',
      description: 'For after midnight.',
      visibility: 'PRIVATE',
    });

    await page.getByRole('button', { name: 'Edit details' }).click();
    await expect(dialog.getByLabel('Title')).toHaveValue('Late night picks');
    await dialog.getByLabel('Title').fill('Late night favourites');
    await dialog.getByRole('radio', { name: 'Unlisted' }).click();
    await expect(dialog.getByTestId('visibility-hint')).toContainText('have the link');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Late night favourites' }),
    ).toBeVisible();
    await expect(page.locator('nc-visibility-chip')).toHaveText('Unlisted');
    await expect(page.getByTestId('copy-link')).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(
      dialog.getByRole('heading', { name: 'Delete Late night favourites?' }),
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete collection' }).click();
    await expect(page).toHaveURL(/\/games$/);
    await expect(page.getByTestId('shelf-collections').locator('nc-collection-box')).toHaveCount(1);
    expect(api.collections.map((stored) => stored.id)).toEqual(['couch']);
  });

  test('the limit of collections is said in the dialog, which stays open', async ({ page }) => {
    const api = await mockCollections(page, GAMES, {
      collections: [couch()],
      limits: { collections: 1, games: 200 },
    });
    await asAlexis(page, api);
    await mockProjects(page);
    await page.goto('/games');

    await page.getByTestId('new-collection').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Title').fill('One too many');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog.getByRole('alert')).toContainText('You already have 1 collections');
    await expect(dialog.getByLabel('Title')).toHaveValue('One too many');
  });
});

test.describe('add to collection, on a game page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/projects/releases/42', answer(200, release));
  });

  test('ticks and unticks at once, goes back when refused, and makes a new one', async ({
    page,
  }) => {
    const api = await mockCollections(page, GAMES, {
      collections: [
        collection('couch', 'Couch co-op', { gameIds: [11, 42] }),
        collection('later', 'To try later', { visibility: 'PRIVATE' }),
        collection('full', 'Jam shortlist', { visibility: 'UNLISTED', gameIds: [11, 12] }),
      ],
    });
    await asAlexis(page, api);
    await page.goto('/play/42');

    const add = page.getByTestId('add-to-collection');
    await expect(add.getByTestId('holding')).toHaveText('1');
    await add.click();
    const list = page.getByRole('dialog', { name: 'Add to collection' });
    const row = (title: string): Locator => list.getByRole('checkbox', { name: title });
    await expect(row('Couch co-op')).toBeChecked();
    await expect(row('To try later')).not.toBeChecked();
    await expect(row('To try later')).toContainText('Private');
    await expect(row('Jam shortlist')).toContainText('Unlisted');
    await expect(row('Jam shortlist').locator('nc-chip').last()).toHaveText('2');

    await row('To try later').click();
    await expect(row('To try later')).toBeChecked();
    await expect(add.getByTestId('holding')).toHaveText('2');
    await expect.poll(() => api.collections[1]?.gameIds).toEqual([42]);

    await row('Couch co-op').click();
    await expect(row('Couch co-op')).not.toBeChecked();
    await expect.poll(() => api.collections[0]?.gameIds).toEqual([11]);
    await expect(add.getByTestId('holding')).toHaveText('1');

    api.limits.games = 2;
    await row('Jam shortlist').click();
    await expect(
      page.getByText('Jam shortlist is full: a collection holds 2 games at most.'),
    ).toBeVisible();
    await expect(row('Jam shortlist')).not.toBeChecked();
    await expect(add.getByTestId('holding')).toHaveText('1');

    await list.getByTestId('new-collection').click();
    const dialog = page.getByRole('dialog').filter({ hasText: 'Who can see it' });
    await expect(dialog.getByRole('heading', { name: 'New collection' })).toBeVisible();
    await dialog.getByLabel('Title').fill('Deep dives');
    await dialog.getByRole('button', { name: 'Create' }).click();
    await expect(dialog).toBeHidden();
    await expect(row('Deep dives')).toBeChecked();
    await expect(add.getByTestId('holding')).toHaveText('2');
    expect(api.collections[0]).toMatchObject({ title: 'Deep dives', gameIds: [42] });
  });

  test('asks a signed-out reader to sign in, then opens the checklist', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    const api = await mockCollections(page, GAMES, {
      collections: [collection('couch', 'Couch co-op', { gameIds: [42] })],
    });
    await page.goto('/play/42');

    const add = page.getByTestId('add-to-collection');
    await expect(add.getByTestId('holding')).toHaveCount(0);
    await add.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    await page.route('**/auth/login', answer(200, { access_token: 'token' }));
    await page.route(
      '**/users/profile',
      answer(200, { id: 1, email: 'a@x', username: 'alexis', nickname: null, createdAt: '' }),
    );
    api.viewer = ALEXIS.id;
    await dialog.getByLabel('Email').fill('a@x.io');
    await dialog.getByLabel('Password').fill('correct horse battery staple');
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page
        .getByRole('dialog', { name: 'Add to collection' })
        .getByRole('checkbox', { name: 'Couch co-op' }),
    ).toBeChecked();
  });
});

test.describe('every public collection', () => {
  const many = Array.from({ length: 30 }, (_, i) =>
    collection(`c${String(i + 1)}`, `Collection ${String(i + 1)}`, {
      owner: i % 2 ? ADA : ALEXIS,
      gameIds: GAMES.slice(0, (i % 4) + 1).map((game) => game.id as number),
    }),
  );

  test('is a grid of boxes, sorted from the address and paged', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    const api = await mockCollections(page, GAMES, {
      collections: [...many, collection('hidden', 'Not listed', { visibility: 'UNLISTED' })],
    });
    await page.goto('/collections');

    const boxes = page.getByTestId('collections').locator('nc-collection-box');
    await expect(page.getByTestId('total')).toHaveText('30');
    await expect(boxes).toHaveCount(24);
    await expect(boxes.first()).toContainText('Collection 1');
    await expect(boxes.first().locator('nc-avatar')).toHaveAttribute('aria-label', 'alexis');
    await expect(page.getByRole('radio', { name: 'Popular' })).toBeChecked();
    await expect(page.getByText('Not listed')).toHaveCount(0);

    await page.getByRole('radio', { name: 'Recent' }).click();
    await expect(page).toHaveURL(/\/collections\?sort=recent$/);
    await expect(boxes.first()).toContainText('Collection 30');
    expect(api.calls.at(-1)?.query).toMatchObject({ sort: 'recent', page: '1' });

    await page.getByRole('radio', { name: 'Most games' }).click();
    await expect(boxes.first()).toContainText('Collection 4');
    await expect(boxes.first().locator('nc-chip')).toHaveText('4 games');

    await page.getByRole('tab', { name: 'Page 2' }).click();
    await expect(page).toHaveURL(/\/collections\?sort=games&page=2$/);
    await expect(boxes).toHaveCount(6);
    expect(api.calls.at(-1)?.query).toMatchObject({ sort: 'games', page: '2' });

    await boxes
      .first()
      .getByRole('link', { name: /^Open / })
      .click();
    await expect(page).toHaveURL(/\/collections\/c\d+$/);
  });

  test('keeps a title on one line of its plate', async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await mockCollections(page, GAMES, {
      collections: [
        collection('jam', 'Everything we loved at the 2026 game jam', { gameIds: [11] }),
      ],
    });
    await page.goto('/collections');

    const title = page.locator('nc-collection-box [ncFitText] > span');
    await expect(title).toHaveText('Everything we loved at the 2026 game jam');
    const line = await title.boundingBox();
    expect(line?.height).toBeLessThan(30);
    expect(await title.evaluate((el) => el.style.transform)).toMatch(/^scaleX\(0\.\d+\)$/);
  });
});

test.describe('my games', () => {
  test('is three shelves: drafts and published two rows high, then collections', async ({
    page,
  }) => {
    const api = await mockCollections(page, GAMES, {
      collections: [
        couch(),
        collection('later', 'To try later', { visibility: 'PRIVATE' }),
        collection('theirs', 'Not mine', { owner: ADA }),
      ],
    });
    await asAlexis(page, api);
    await mockProjects(page, [
      ...Array.from({ length: 9 }, (_, i) => project(100 + i, `Draft ${String(i + 1)}`, false)),
      project(201, 'Pong Royale', true),
      project(202, 'Night Courier', true),
    ]);
    await page.goto('/games');

    const drafts = page.getByTestId('shelf-drafts');
    await expect(drafts.getByRole('heading', { name: 'Drafts' })).toBeVisible();
    await expect(drafts.locator('h3 + nc-chip')).toHaveText('9');
    await expect(drafts.getByRole('link', { name: 'New game' })).toHaveAttribute(
      'href',
      '/games/new',
    );
    await expect(drafts.getByRole('link', { name: 'Draft 1', exact: true })).toHaveAttribute(
      'href',
      '/edit/100',
    );
    // Four across at this width, on two rows: the tenth thing waits on the second page.
    await expect(drafts.locator('[role="listitem"]:not([inert])')).toHaveCount(8);
    const firstRow = await drafts.locator('[role="listitem"]').nth(0).boundingBox();
    const secondRow = await drafts.locator('[role="listitem"]').nth(4).boundingBox();
    expect(secondRow?.y).toBeGreaterThan((firstRow?.y ?? 0) + (firstRow?.height ?? 0) - 1);

    const published = page.getByTestId('shelf-published');
    await expect(published.locator('h3 + nc-chip')).toHaveText('2');
    await expect(published.getByRole('link', { name: 'See all' })).toHaveCount(0);
    await expect(published.getByRole('link', { name: 'Pong Royale' })).toHaveAttribute(
      'href',
      '/edit/201',
    );

    const boxes = page.getByTestId('shelf-collections');
    await expect(boxes.locator('h3 + nc-chip')).toHaveText('2');
    await expect(
      boxes.locator('[role="listitem"]').first().getByTestId('new-collection'),
    ).toBeVisible();
    await expect(boxes.locator('nc-collection-box')).toHaveCount(2);
    await expect(boxes.locator('nc-collection-box').first()).toContainText('Couch co-op');
    await expect(boxes.locator('nc-visibility-chip')).toHaveText(['Public', 'Private']);
    await expect(boxes.locator('nc-collection-box nc-avatar')).toHaveCount(0);
    await expect(boxes).not.toContainText('Not mine');

    await drafts.getByRole('link', { name: 'See all' }).click();
    await expect(page).toHaveURL(/\/games\?all=drafts$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Drafts' })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Draft \d$/ })).toHaveCount(9);
    await page.getByRole('link', { name: 'My games' }).last().click();
    await expect(page.getByTestId('shelf-published')).toBeVisible();
  });

  test('leaves out a shelf with nothing on it, but always offers a game and a collection', async ({
    page,
  }) => {
    const api = await mockCollections(page, GAMES);
    await asAlexis(page, api);
    await mockProjects(page);
    await page.goto('/games');

    await expect(
      page.getByTestId('shelf-drafts').getByRole('link', { name: 'New game' }),
    ).toBeVisible();
    await expect(page.getByTestId('shelf-drafts').locator('h3 + nc-chip')).toHaveText('0');
    await expect(page.getByTestId('shelf-published')).toHaveCount(0);
    await expect(page.getByTestId('shelf-collections').getByTestId('new-collection')).toBeVisible();
    await expect(page.getByTestId('shelf-collections').locator('h3 + nc-chip')).toHaveText('0');

    await mockProjects(page, [project(201, 'Pong Royale', true)]);
    await page.reload();
    await expect(page.getByTestId('shelf-published')).toBeVisible();
    await expect(page.getByTestId('shelf-drafts')).toHaveCount(0);
  });

  test('does not scroll sideways on a phone', async ({ page }) => {
    const api = await mockCollections(page, GAMES, { collections: [couch()] });
    await asAlexis(page, api);
    await mockProjects(page, [project(100, 'Draft 1', false), project(201, 'Pong Royale', true)]);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/games');

    await expect(page.getByTestId('shelf-collections').locator('nc-collection-box')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
});

test.describe('a profile', () => {
  const profile = (person: typeof ALEXIS): Record<string, unknown> => ({
    data: { ...person, nickname: null, description: null, createdAt: '2026-01-01T00:00:00.000Z' },
  });

  test('lists the public collections of its person, and no shelf for someone with none', async ({
    page,
  }) => {
    await page.route('**/auth/refresh', answer(401, {}));
    await page.route('**/users/public/username/alexis/profile', answer(200, profile(ALEXIS)));
    await page.route('**/users/public/username/ada/profile', answer(200, profile(ADA)));
    await mockCollections(page, GAMES, {
      collections: [couch(), collection('later', 'To try later', { visibility: 'PRIVATE' })],
    });
    await page.goto('/u/alexis');

    const boxes = page.getByTestId('profile-collections').locator('nc-collection-box');
    await expect(boxes).toHaveCount(1);
    await expect(boxes).toContainText('Couch co-op');
    await expect(page.getByText('To try later')).toHaveCount(0);

    await page.goto('/u/ada');
    await expect(page.getByRole('heading', { level: 1, name: 'ada' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Collections' })).toHaveCount(0);
  });
});
