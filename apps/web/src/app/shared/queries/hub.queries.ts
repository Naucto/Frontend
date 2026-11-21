import { inject } from '@angular/core';
import {
  type GameSessionResponseDto,
  hubControllerGetPaginatedReleases,
  hubFeedControllerGetHub,
  hubFeedControllerGetShelf,
  hubFeedControllerGetShelves,
  type HubResponseDto,
  type HubShelfDto,
  multiplayerControllerLeave,
  multiplayerControllerList,
} from '@naucto/api-client';
import {
  type CreateInfiniteQueryResult,
  type CreateMutationResult,
  type CreateQueryResult,
  type InfiniteData,
  injectInfiniteQuery,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import type { HubGame } from '../hub/hub-game';
import { qk } from './query-keys';
import { RELEASE_PAGE_SIZE, releaseParams, type ReleaseSort } from './releases.queries';

/** The hub as the day drew it for this reader: the hero, the opening shelves, the keys of the rest. */
export function injectHubFeed(): CreateQueryResult<HubResponseDto> {
  const auth = inject(AuthStore);
  return injectQuery(() => ({
    queryKey: qk.hubFeed(auth.user()?.id ?? null),
    queryFn: async () => unwrap(await hubFeedControllerGetHub()),
  }));
}

/** The shelves of those keys, in that order; one with nothing to show is left out. */
export function injectHubShelves(keys: () => readonly string[]): CreateQueryResult<HubShelfDto[]> {
  return injectQuery(() => ({
    queryKey: qk.hubShelves(keys()),
    queryFn: async () =>
      unwrap(await hubFeedControllerGetShelves({ query: { keys: keys().join(',') } })).shelves,
  }));
}

/** What a results view lists: a shelf opened out, or the catalogue searched or narrowed to tags. */
export interface ResultsQuery {
  shelf?: string;
  search?: string;
  /** Comma-separated; a game must carry all of them. */
  tags?: string;
  /** Left out, a shelf keeps its own order and a search its best match first. */
  sort?: ReleaseSort;
}

interface ResultsPage {
  games: HubGame[];
  total: number;
  page: number;
}

/** The games of a results view, page after page. */
export function injectHubResults(
  query: () => ResultsQuery,
  limit = RELEASE_PAGE_SIZE,
): CreateInfiniteQueryResult<InfiniteData<ResultsPage, number>> {
  return injectInfiniteQuery(() => ({
    queryKey: qk.hubResults({ limit, ...query() }),
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<ResultsPage> => {
      const { shelf, sort, ...filters } = query();
      if (shelf) {
        const res = unwrap(
          await hubFeedControllerGetShelf({
            path: { key: shelf },
            query: { page: pageParam, limit, sort },
          }),
        );
        return { games: res.games, total: res.total, page: pageParam };
      }
      const res = unwrap(
        await hubControllerGetPaginatedReleases({
          query: { page: pageParam, limit, ...releaseParams({ ...filters, sort }) },
        }),
      );
      return { games: res.projects, total: res.total, page: pageParam };
    },
    getNextPageParam: (last: ResultsPage): number | undefined =>
      last.page * limit < last.total ? last.page + 1 : undefined,
  }));
}

/** The sessions the signed-in reader may join; nothing is asked for a visitor. */
export function injectOpenSessions(): CreateQueryResult<GameSessionResponseDto[]> {
  const auth = inject(AuthStore);
  return injectQuery(() => ({
    queryKey: qk.openSessions(),
    enabled: auth.isAuthenticated(),
    queryFn: async () => unwrap(await multiplayerControllerList()).sessions,
  }));
}

/** Leaves a session by its id, and asks again for the ones that are open. */
export function injectLeaveSession(): CreateMutationResult<void, Error, string> {
  const client = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (sessionId: string): Promise<void> => {
      unwrap(await multiplayerControllerLeave({ path: { sessionId } }));
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.openSessions() }),
  }));
}
