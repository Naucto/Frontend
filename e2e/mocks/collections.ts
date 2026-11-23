import type { Page, Route } from '@playwright/test';

import { uuidOf } from '../../packages/api-client/testing';

export interface Person {
  id: string;
  username: string;
}

export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

export interface StoredCollection {
  id: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  owner: Person;
  /** Its games on the hub, in order. */
  gameIds: string[];
  /** Games it lists that left the hub. */
  unavailable: string[];
  /** Since when moderation withholds it; null while it does not. */
  hiddenAt: string | null;
}

export interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

export interface CollectionsApi {
  collections: StoredCollection[];
  /** Who is asking, as the server would know from the token; null for nobody. */
  viewer: string | null;
  limits: { collections: number; games: number };
  /** Games of the viewer that moderation withholds: no collection takes one. */
  hiddenGames: string[];
  /** Every request answered, in order. */
  calls: Call[];
}

export const ALEXIS: Person = { id: uuidOf(1), username: 'alexis' };
export const ADA: Person = { id: uuidOf(7), username: 'ada' };

/** What makes a game of `hubGame` this person's: passed as what it overrides. */
export const by = (creator: Person): Record<string, unknown> => ({ userId: creator.id, creator });

export function collection(
  id: string,
  title: string,
  over: Partial<StoredCollection> = {},
): StoredCollection {
  return {
    id,
    title,
    description: null,
    visibility: 'PUBLIC',
    owner: ALEXIS,
    gameIds: [],
    unavailable: [],
    hiddenAt: null,
    ...over,
  };
}

const LIMIT_CODES = { collections: 'COLLECTIONS_LIMIT', games: 'COLLECTION_GAMES_LIMIT' } as const;

/**
 * Answers the collection routes from a list held in memory, with the rules the server keeps: a
 * private collection is its owner's alone, only an owner changes one, and both limits refuse with
 * their code. One moderation withholds is its owner's alone too, and takes no change but a game
 * taken out or its own deletion. The list and the viewer can be changed while the page is open.
 */
export async function mockCollections(
  page: Page,
  games: Record<string, unknown>[],
  seed: Partial<Pick<CollectionsApi, 'collections' | 'viewer' | 'limits'>> = {},
): Promise<CollectionsApi> {
  const api: CollectionsApi = {
    collections: seed.collections ?? [],
    viewer: seed.viewer ?? null,
    limits: seed.limits ?? { collections: 50, games: 200 },
    hiddenGames: [],
    calls: [],
  };
  let created = 0;

  const json = (route: Route, status: number, body?: unknown): Promise<void> =>
    body === undefined
      ? route.fulfill({ status })
      : route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const refuse = (route: Route, limit: keyof typeof LIMIT_CODES): Promise<void> =>
    json(route, 400, {
      statusCode: 400,
      error: 'Bad Request',
      code: LIMIT_CODES[limit],
      message: 'Limit reached',
      max: api.limits[limit],
    });
  const gamesOf = (stored: StoredCollection): Record<string, unknown>[] =>
    stored.gameIds.flatMap((id) => games.filter((game) => game.id === id));
  const header = (stored: StoredCollection): Record<string, unknown> => ({
    id: stored.id,
    title: stored.title,
    description: stored.description,
    visibility: stored.visibility,
    owner: stored.owner,
    gameCount: stored.gameIds.length,
    hiddenAt: stored.hiddenAt,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  });
  const preview = (stored: StoredCollection): Record<string, unknown> => ({
    ...header(stored),
    games: gamesOf(stored).slice(0, 8),
  });
  const detail = (stored: StoredCollection): Record<string, unknown> => ({
    ...header(stored),
    games: gamesOf(stored),
    unavailableGameIds: stored.owner.id === api.viewer ? stored.unavailable : [],
  });

  await page.route(
    /\/(collections|users\/me\/collections|users\/public\/[^/]+\/collections)(\/|\?|$)/,
    (route) => {
      const request = route.request();
      // The app's own pages live under the same paths.
      if (request.resourceType() === 'document') {
        return route.fallback();
      }
      const url = new URL(request.url());
      const method = request.method();
      const body: unknown = request.postDataJSON();
      api.calls.push({
        method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
      });

      if (url.pathname === '/users/me/collections') {
        const asked = url.searchParams.get('projectId');
        return json(
          route,
          200,
          api.collections
            .filter((stored) => stored.owner.id === api.viewer)
            .map((stored) => ({
              ...preview(stored),
              ...(asked === null
                ? {}
                : {
                    contains: [...stored.gameIds, ...stored.unavailable].includes(asked),
                  }),
            })),
        );
      }
      const person = /^\/users\/public\/([^/]+)\/collections$/.exec(url.pathname);
      if (person) {
        return json(
          route,
          200,
          api.collections
            .filter(
              (stored) =>
                stored.owner.id === person[1] && stored.visibility === 'PUBLIC' && !stored.hiddenAt,
            )
            .map(preview),
        );
      }
      if (url.pathname === '/collections' && method === 'GET') {
        const listed = api.collections.filter(
          (stored) => stored.visibility === 'PUBLIC' && !stored.hiddenAt,
        );
        const sort = url.searchParams.get('sort');
        if (sort === 'recent') {
          listed.reverse();
        } else if (sort === 'games') {
          listed.sort((a, b) => b.gameIds.length - a.gameIds.length);
        }
        const number = Number(url.searchParams.get('page') ?? 1);
        const limit = Number(url.searchParams.get('limit') ?? 24);
        return json(route, 200, {
          collections: listed.slice((number - 1) * limit, number * limit).map(preview),
          total: listed.length,
          page: number,
          limit,
        });
      }
      if (url.pathname === '/collections') {
        const owner = api.collections.find((stored) => stored.owner.id === api.viewer)?.owner ?? {
          id: api.viewer ?? '',
          username: 'someone',
        };
        const mine = api.collections.filter((stored) => stored.owner.id === api.viewer).length;
        if (mine >= api.limits.collections) {
          return refuse(route, 'collections');
        }
        const fields = body as Partial<StoredCollection>;
        created += 1;
        const stored = collection(`new-${String(created)}`, fields.title ?? '', {
          description: fields.description ?? null,
          visibility: fields.visibility ?? 'PRIVATE',
          owner,
        });
        api.collections.unshift(stored);
        return json(route, 201, detail(stored));
      }

      const [, id, , game] =
        /^\/collections\/([^/]+)(\/games(?:\/([^/]+))?)?$/.exec(url.pathname) ?? [];
      const stored = api.collections.find((other) => other.id === id);
      const owned = stored?.owner.id === api.viewer;
      if (!stored || ((stored.visibility === 'PRIVATE' || stored.hiddenAt) && !owned)) {
        return json(route, 404, { statusCode: 404, message: 'Not Found' });
      }
      if (method === 'GET') {
        return json(route, 200, detail(stored));
      }
      if (!owned) {
        return json(route, 403, { statusCode: 403, message: 'Forbidden' });
      }
      if (stored.hiddenAt && method !== 'DELETE') {
        return json(route, 403, { statusCode: 403, code: 'COLLECTION_HIDDEN', message: 'Hidden' });
      }
      if (url.pathname.endsWith('/games')) {
        const asked = (body as { projectIds: string[] }).projectIds;
        stored.gameIds = [...asked, ...stored.gameIds.filter((other) => !asked.includes(other))];
        return json(route, 204);
      }
      if (game !== undefined && method === 'PUT') {
        if (api.hiddenGames.includes(game)) {
          return json(route, 403, { statusCode: 403, code: 'PROJECT_HIDDEN', message: 'Hidden' });
        }
        if (stored.gameIds.length >= api.limits.games) {
          return refuse(route, 'games');
        }
        if (!stored.gameIds.includes(game)) {
          stored.gameIds.push(game);
        }
        return json(route, 204);
      }
      if (game !== undefined) {
        stored.gameIds = stored.gameIds.filter((other) => other !== game);
        stored.unavailable = stored.unavailable.filter((other) => other !== game);
        return json(route, 204);
      }
      if (method === 'DELETE') {
        api.collections = api.collections.filter((other) => other !== stored);
        return json(route, 204);
      }
      Object.assign(stored, body);
      return json(route, 200, detail(stored));
    },
  );
  return api;
}
