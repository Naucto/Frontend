import type { Page } from '@playwright/test';

/** A game as the hub's routes answer it. */
export const hubGame = (
  id: number,
  name: string,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  name,
  shortDesc: `What ${name} is.`,
  longDesc: null,
  tags: ['arcade'],
  palette: [],
  iconUrl: null,
  coverUrl: null,
  clipUrl: null,
  disk: null,
  status: 'COMPLETED',
  monetization: 'NONE',
  price: null,
  userId: 7,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  publishedAt: '2026-09-01T00:00:00.000Z',
  viewCount: 1000 - id,
  uniquePlayers: 3,
  likes: id,
  commentCount: 2,
  forkCount: 0,
  forkedFromId: null,
  collaborators: [],
  creator: { id: 7, username: 'ada' },
  ...over,
});

/** The signed-in reader's own projects, as My games and the hub's own shelf ask for them. */
export async function mockProjects(
  page: Page,
  projects: Record<string, unknown>[] = [],
): Promise<void> {
  await page.route(/\/projects\?/, (route) =>
    route.fulfill({
      json: {
        projects,
        total: projects.length,
        page: 1,
        limit: Number(new URL(route.request().url()).searchParams.get('limit')),
      },
    }),
  );
}

/** `count` games called `<name> 1`…, numbered from `from`. */
export const games = (
  count: number,
  name: string,
  from: number,
  over: Record<string, unknown> = {},
): Record<string, unknown>[] =>
  Array.from({ length: count }, (_, i) => hubGame(from + i, `${name} ${String(i + 1)}`, over));

const shelf = (
  key: string,
  kind: string,
  total: number,
  list: Record<string, unknown>[],
): Record<string, unknown> => ({
  key,
  kind,
  ...(kind === 'TAG' ? { tag: key.slice('tag:'.length) } : {}),
  total,
  games: list,
});

/** The catalogue behind a shelf's "see all": thirty games, tagged in three groups. */
export const POPULAR = [
  ...games(12, 'Popular', 100),
  ...games(12, 'Riddle', 200, { tags: ['puzzle', 'chill'] }),
  ...games(6, 'Loose', 300, { tags: [] }),
];

export const FEED = {
  day: '2026-11-21',
  hero: [
    { reason: 'GAME_OF_THE_WEEK', game: hubGame(1, 'Orbit Run') },
    { reason: 'TRENDING', game: hubGame(2, 'Neon Drift') },
    {
      reason: 'BECAUSE_YOU_PLAYED',
      reasonGame: { id: 1, name: 'Orbit Run' },
      game: hubGame(3, 'Ferry Click'),
    },
    {
      reason: 'CONTINUE',
      game: hubGame(4, 'Cave Diver', { userId: 1, creator: { id: 1, username: 'alexis' } }),
    },
  ],
  shelves: [
    shelf('popular', 'POPULAR', POPULAR.length, POPULAR.slice(0, 24)),
    shelf('trending', 'TRENDING', 6, games(6, 'Trending', 400)),
    {
      key: 'collections',
      kind: 'COLLECTIONS',
      total: 8,
      games: [],
      collections: [
        {
          id: 'c0ffee00-0000-4000-8000-000000000001',
          title: 'Couch co-op',
          description: null,
          visibility: 'PUBLIC',
          owner: { id: 9, username: 'louis' },
          gameCount: 6,
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          games: games(6, 'Couch', 500),
        },
      ],
    },
  ],
  more: ['tag:arcade', 'tag:puzzle', 'tag:chill', 'tag:action'],
};

export const SESSION = {
  sessionUuid: 'room-1',
  title: 'Friday night',
  visibility: 'PUBLIC',
  hostId: 9,
  hostUsername: 'louis',
  projectId: 2,
  projectName: 'Neon Drift',
  maxPlayers: 4,
  playerCount: 2,
  startedAt: '2026-11-21T10:00:00.000Z',
  roster: [{ username: 'louis' }, { username: 'lea' }],
  coverUrl: null,
};

export interface HubMock {
  feed?: Record<string, unknown>;
  /** Keys whose batch is refused, until the list is emptied. */
  failing?: string[];
  /** What a search or a tag finds. */
  found?: Record<string, unknown>[];
}

/**
 * The hub's routes over one catalogue: the feed, the shelves asked for by key, a shelf opened out
 * a page at a time, and the releases a search or a tag lists. Returns every `/hub/shelves?keys=`
 * that was asked, in order.
 */
export async function mockHub(page: Page, mock: HubMock = {}): Promise<string[]> {
  const asked: string[] = [];
  // The page itself is served at `/hub`: only the feed is answered here.
  await page.route('**/hub', (route) =>
    route.request().resourceType() === 'document'
      ? route.fallback()
      : route.fulfill({ json: mock.feed ?? FEED }),
  );
  await page.route(/\/hub\/shelves\?/, (route) => {
    const keys = new URL(route.request().url()).searchParams.get('keys') ?? '';
    asked.push(keys);
    if (keys.split(',').some((key) => mock.failing?.includes(key))) {
      return route.fulfill({ status: 400, json: { message: 'no' } });
    }
    return route.fulfill({
      json: {
        shelves: keys
          .split(',')
          .map((key) => shelf(key, 'TAG', 3, games(3, key.slice('tag:'.length), 600))),
      },
    });
  });
  await page.route(/\/hub\/shelves\/[^/?]+/, (route) => {
    const url = new URL(route.request().url());
    const number = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 24);
    const sorted = url.searchParams.get('sort') === 'fresh' ? [...POPULAR].reverse() : POPULAR;
    return route.fulfill({
      json: {
        ...shelf('popular', 'POPULAR', POPULAR.length, []),
        games: sorted.slice((number - 1) * limit, number * limit),
        page: number,
        limit,
      },
    });
  });
  await page.route('**/projects/releases/paginated**', (route) =>
    route.fulfill({ json: { projects: mock.found ?? [], total: mock.found?.length ?? 0 } }),
  );
  await page.route('**/projects/releases/tags**', (route) =>
    route.fulfill({
      json: {
        tags: [
          { tag: 'arcade', count: 4 },
          { tag: 'puzzle', count: 2 },
        ],
      },
    }),
  );
  return asked;
}
