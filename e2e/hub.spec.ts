import { expect, test } from './fixtures';
import { FEED, games, hubGame, mockHub, POPULAR, SESSION } from './mocks/hub';
import { answer, mockSignedIn } from './mocks/session';

test.use({ viewport: { width: 1440, height: 900 } });

test.describe('the hub', () => {
  test('stacks the hero from the feed and says why each game is there', async ({ page }) => {
    await mockHub(page);
    await page.goto('/hub');
    const hero = page.locator('nc-hero-pile');

    await expect(hero.getByRole('status')).toContainText('1 of 4: Orbit Run');
    await expect(hero.getByText('Game of the week')).toBeVisible();
    await expect(hero.locator('h2')).toHaveText('Orbit Run');

    await hero.getByRole('tab', { name: 'Ferry Click' }).click();
    await expect(hero.getByText('Because you played Orbit Run')).toBeVisible();

    await hero.getByRole('button', { name: 'Play Ferry Click' }).click();
    await expect(page).toHaveURL(/\/play\/3$/);
  });

  test('shows a visitor the shelves of the day and none of the personal ones', async ({ page }) => {
    await mockHub(page);
    await page.goto('/hub');

    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      'Popular',
      'Trending this week',
      'Collections',
    ]);
    const popular = page.locator('[data-shelf="popular"]');
    await expect(popular.getByRole('link', { name: 'Popular 1', exact: true })).toHaveAttribute(
      'href',
      '/play/100',
    );
    await expect(popular.getByRole('link', { name: 'See all 30' })).toHaveAttribute(
      'href',
      '/hub?shelf=popular',
    );
    const collections = page.locator('[data-shelf="collections"]');
    await expect(collections.getByRole('link', { name: 'See all 8' })).toHaveAttribute(
      'href',
      '/collections',
    );
    await expect(collections.getByRole('link', { name: /^Open Couch co-op/ })).toHaveAttribute(
      'href',
      '/collections/c0ffee00-0000-4000-8000-000000000001',
    );
  });

  test('leaves out the hero and every shelf the feed does not hold', async ({ page }) => {
    await mockHub(page, {
      feed: { ...FEED, hero: [], shelves: FEED.shelves.slice(0, 1), more: [] },
    });
    await page.goto('/hub');

    await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Popular']);
    await expect(page.locator('nc-hero-pile')).toHaveCount(0);
  });

  test('asks for the tag shelves three at a time, only as the page nears them', async ({
    page,
  }) => {
    const asked = await mockHub(page);
    await page.goto('/hub');
    await expect(page.locator('[data-shelf="popular"]')).toBeVisible();
    expect(asked).toEqual([]);

    await page.locator('[data-shelf="collections"]').scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'Arcade', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Chill', exact: true })).toBeVisible();
    expect(asked).toEqual(['tag:arcade,tag:puzzle,tag:chill']);

    await page.locator('[data-shelf="tag:chill"]').scrollIntoViewIfNeeded();
    await expect(page.getByRole('heading', { name: 'Action', exact: true })).toBeVisible();
    expect(asked).toEqual(['tag:arcade,tag:puzzle,tag:chill', 'tag:action']);
  });

  test('a batch that fails says so, lets the next one load and can be asked again', async ({
    page,
  }) => {
    const failing = ['tag:puzzle'];
    await mockHub(page, { failing });
    await page.goto('/hub');
    await page.locator('[data-shelf="collections"]').scrollIntoViewIfNeeded();

    const failed = page.getByRole('alert').filter({ hasText: 'Could not load these shelves' });
    await expect(failed).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Action', exact: true })).toBeVisible();

    failing.length = 0;
    await failed.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('heading', { name: 'Puzzle', exact: true })).toBeVisible();
    await expect(failed).toHaveCount(0);
  });

  test('says when the feed cannot be loaded, and loads it on retry', async ({ page }) => {
    await page.goto('/hub');
    const failed = page.getByRole('alert').filter({ hasText: 'Could not load the hub' });
    await expect(failed).toBeVisible();

    await mockHub(page);
    await failed.getByRole('button', { name: 'Try again' }).click();
    await expect(page.locator('nc-hero-pile').getByRole('status')).toContainText('Orbit Run');
  });

  test('gives a signed-in reader their games and the open sessions, before the rest', async ({
    page,
  }) => {
    await mockSignedIn(page);
    await mockHub(page);
    await page.route(/\/projects\?/, (route) =>
      route.fulfill({
        json: {
          projects: [hubGame(4, 'Cave Diver', { publishedAt: null }), hubGame(5, 'Moon Lander')],
          total: 2,
        },
      }),
    );
    await page.route('**/game-sessions', answer(200, { sessions: [SESSION] }));
    await page.goto('/hub');

    await expect(page.getByRole('heading', { level: 3 })).toHaveText([
      'Your games',
      'Open sessions',
      'Popular',
      'Trending this week',
      'Collections',
    ]);
    const mine = page.locator('[data-shelf="mine"]');
    await expect(mine.getByRole('listitem').first().getByRole('link')).toHaveAttribute(
      'href',
      '/games/new',
    );
    await expect(mine.getByRole('link', { name: 'Cave Diver' })).toHaveAttribute('href', '/edit/4');
    await expect(mine.getByRole('link', { name: 'See all 2' })).toHaveAttribute('href', '/games');

    const hero = page.locator('nc-hero-pile');
    await hero.getByRole('tab', { name: 'Cave Diver' }).click();
    await expect(hero.getByText('Continue', { exact: true })).toBeVisible();
    await expect(hero.getByText('Your game', { exact: true })).toBeVisible();

    const session = page.locator('[data-shelf="sessions"]').getByRole('listitem').first();
    await expect(session.locator('.sticker .card')).toHaveCount(3);
    await expect(session.locator('.sticker .seat')).toHaveCount(2);
    await session.locator('.action.join .rind').click();
    await expect(page).toHaveURL(/\/play\/2\?session=room-1$/);
  });
});

test.describe('the results view', () => {
  test('opens a shelf out from its "see all", in shelves by first tag, a page at a time', async ({
    page,
  }) => {
    await mockHub(page);
    await page.goto('/hub');
    await page.locator('[data-shelf="popular"]').getByRole('link', { name: 'See all 30' }).click();

    await expect(page).toHaveURL(/\/hub\?shelf=popular$/);
    await expect(page.getByText('Shelf', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Popular');
    await expect(page.getByTestId('results-count')).toHaveText('30');
    await expect(page.getByRole('radio', { name: 'Hub order' })).toBeChecked();

    const arcade = page.getByRole('region', { name: 'Arcade' });
    await expect(arcade.locator('[role="listitem"]')).toHaveCount(12);
    await expect(arcade.locator('nc-chip[shelfAction]')).toHaveText('12');
    await expect(arcade.getByRole('link', { name: 'Popular 1', exact: true })).toContainText(
      'Popular 1',
    );
    await expect(
      page.getByRole('region', { name: 'Puzzle' }).locator('[role="listitem"]'),
    ).toHaveCount(12);
    await expect(page.getByRole('region', { name: 'Untagged' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Show 6 more' }).click();
    await expect(
      page.getByRole('region', { name: 'Untagged' }).locator('[role="listitem"]'),
    ).toHaveCount(6);
    await expect(page.getByRole('button', { name: /^Show/ })).toHaveCount(0);

    const sorted = page.waitForRequest(/\/hub\/shelves\/popular\?.*sort=fresh/);
    await page.getByRole('radio', { name: 'Newest' }).click();
    await sorted;
    await expect(page.getByRole('region').first()).toHaveAccessibleName('Untagged');

    await page.getByRole('link', { name: 'Back to the hub' }).click();
    await expect(page).toHaveURL(/\/hub$/);
    await expect(page.locator('nc-hero-pile')).toBeVisible();
  });

  test('lists what the top bar search finds, and sorts it on the server', async ({ page }) => {
    await mockHub(page, { found: games(3, 'Cave', 700) });
    await page.goto('/hub');
    const field = page.getByRole('combobox', { name: 'Search games, people, tags…' });
    await field.fill('cave');
    await field.press('Enter');

    await expect(page).toHaveURL(/\/hub\?q=cave$/);
    await expect(page.getByText('Search', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('“cave”');
    await expect(page.getByTestId('results-count')).toHaveText('3');
    await expect(page.getByRole('radio', { name: 'Best match' })).toBeChecked();

    const sorted = page.waitForRequest(/\/projects\/releases\/paginated\?.*sort=popular/);
    await page.getByRole('radio', { name: 'Most played' }).click();
    expect(new URL((await sorted).url()).searchParams.get('search')).toBe('cave');
  });

  test('lists the games that carry a tag', async ({ page }) => {
    await mockHub(page, { found: POPULAR.slice(0, 4) });
    const listed = page.waitForRequest(/\/projects\/releases\/paginated\?/);
    await page.goto('/hub?tags=arcade');

    expect(new URL((await listed).url()).searchParams.get('tags')).toBe('arcade');
    await expect(page.getByText('Tag', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('#arcade');
    await expect(page.getByRole('region', { name: 'Arcade' }).getByRole('link')).toHaveCount(4);
  });

  test('with nothing to show, offers the most used tags and to make the game', async ({ page }) => {
    await mockHub(page);
    await page.goto('/hub?q=zzz');

    await expect(page.getByRole('heading', { name: 'No disk in the drive' })).toBeVisible();
    await expect(page.getByTestId('results-count')).toHaveText('0');
    await expect(page.getByRole('link', { name: 'Make it yourself' })).toHaveAttribute(
      'href',
      '/games/new',
    );
    await page.getByRole('link', { name: '#puzzle' }).click();
    await expect(page).toHaveURL(/\/hub\?tags=puzzle$/);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('#puzzle');
  });

  test('still answers the address the old "see all" page had', async ({ page }) => {
    await mockHub(page);
    await page.goto('/hub/all/popular');

    await expect(page).toHaveURL(/\/hub\?shelf=popular$/);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('Popular');
  });
});
