import { inject } from '@angular/core';
import {
  type CollectionDto,
  type CollectionPreviewDto,
  collectionsControllerAddGame,
  collectionsControllerCreate,
  collectionsControllerFindOne,
  collectionsControllerList,
  collectionsControllerRemove,
  collectionsControllerRemoveGame,
  collectionsControllerReorder,
  collectionsControllerUpdate,
  type CollectionsPageDto,
  type CreateCollectionDto,
  type MyCollectionDto,
  type UpdateCollectionDto,
  userCollectionsControllerMine,
  userCollectionsControllerPublicOf,
} from '@naucto/api-client';
import {
  type CreateMutationResult,
  type CreateQueryResult,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';

import { ApiError, unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { qk } from './query-keys';

export type CollectionSort = 'popular' | 'recent' | 'games';

export const COLLECTION_PAGE_SIZE = 24;

/** The count a refusal names when it is the limit `code` says, or null for any other failure. */
export function limitOf(
  error: unknown,
  code: 'COLLECTIONS_LIMIT' | 'COLLECTION_GAMES_LIMIT',
): number | null {
  if (!(error instanceof ApiError) || error.code !== code) {
    return null;
  }
  const max = (error.body as { max?: unknown } | null)?.max;
  return typeof max === 'number' ? max : null;
}

export function injectCollection(id: () => string): CreateQueryResult<CollectionDto> {
  const auth = inject(AuthStore);
  return injectQuery(() => ({
    queryKey: qk.collection(id(), auth.userId()),
    enabled: auth.status() !== 'booting',
    queryFn: async () => unwrap(await collectionsControllerFindOne({ path: { id: id() } })),
  }));
}

/** One page of the public collections, the page before it staying on screen while it loads. */
export function injectCollectionsPage(
  page: () => number,
  sort: () => CollectionSort,
): CreateQueryResult<CollectionsPageDto> {
  return injectQuery(() => ({
    queryKey: qk.collectionsPage({ page: page(), sort: sort() }),
    queryFn: async () =>
      unwrap(
        await collectionsControllerList({
          query: { page: page(), limit: COLLECTION_PAGE_SIZE, sort: sort() },
        }),
      ),
    placeholderData: (prev: CollectionsPageDto | undefined) => prev,
  }));
}

/** The viewer's own collections; with a game, each says whether it holds it. */
export function injectMyCollections(
  projectId: () => string | null = () => null,
): CreateQueryResult<MyCollectionDto[]> {
  const auth = inject(AuthStore);
  return injectQuery(() => ({
    queryKey: qk.myCollections(projectId()),
    enabled: auth.isAuthenticated(),
    queryFn: async () => {
      const game = projectId();
      return unwrap(
        await userCollectionsControllerMine({ query: game === null ? {} : { projectId: game } }),
      );
    },
  }));
}

/** The public collections of a person. */
export function injectUserCollections(
  userId: () => string,
): CreateQueryResult<CollectionPreviewDto[]> {
  return injectQuery(() => ({
    queryKey: qk.userCollections(userId()),
    enabled: userId() !== '',
    queryFn: async () =>
      unwrap(await userCollectionsControllerPublicOf({ path: { id: userId() } })),
  }));
}

function invalidateCollection(queries: QueryClient, id: string): Promise<unknown> {
  return Promise.all([
    queries.invalidateQueries({ queryKey: qk.collectionAll(id) }),
    queries.invalidateQueries({ queryKey: qk.collectionLists() }),
  ]);
}

export function injectCreateCollection(): CreateMutationResult<
  CollectionDto,
  Error,
  CreateCollectionDto
> {
  const queries = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (body: CreateCollectionDto) =>
      unwrap(await collectionsControllerCreate({ body })),
    onSuccess: () => queries.invalidateQueries({ queryKey: qk.collectionLists() }),
  }));
}

export interface CollectionPatch {
  id: string;
  patch: UpdateCollectionDto;
}

export function injectUpdateCollection(): CreateMutationResult<
  CollectionDto,
  Error,
  CollectionPatch
> {
  const queries = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async ({ id, patch }: CollectionPatch) =>
      unwrap(await collectionsControllerUpdate({ path: { id }, body: patch })),
    onSuccess: (_: CollectionDto, { id }: CollectionPatch) => invalidateCollection(queries, id),
  }));
}

export function injectDeleteCollection(): CreateMutationResult<unknown, Error, string> {
  const queries = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (id: string) => {
      unwrap(await collectionsControllerRemove({ path: { id } }));
    },
    onSuccess: (_: unknown, id: string) => {
      // Removed, not invalidated: a refetch of what is gone would answer 404 to a page still open.
      queries.removeQueries({ queryKey: qk.collectionAll(id) });
      return queries.invalidateQueries({ queryKey: qk.collectionLists() });
    },
  }));
}

export interface CollectionMembership {
  id: string;
  projectId: string;
  /** Whether the collection is to hold the game. */
  holds: boolean;
}

/**
 * Puts a game in a collection or takes it out. The viewer's list asked about that game answers at
 * once, and goes back to what it said when the server refuses.
 */
export function injectSetInCollection(): CreateMutationResult<
  unknown,
  Error,
  CollectionMembership,
  MyCollectionDto[] | undefined
> {
  const queries = inject(QueryClient);
  return injectMutation<unknown, Error, CollectionMembership, MyCollectionDto[] | undefined>(
    () => ({
      mutationFn: async ({ id, projectId, holds }) => {
        const path = { id, projectId };
        unwrap(
          await (holds
            ? collectionsControllerAddGame({ path })
            : collectionsControllerRemoveGame({ path })),
        );
      },
      onMutate: async ({ id, projectId, holds }) => {
        const key = qk.myCollections(projectId);
        await queries.cancelQueries({ queryKey: key });
        const before = queries.getQueryData<MyCollectionDto[]>(key);
        queries.setQueryData<MyCollectionDto[]>(key, (mine) =>
          mine?.map((collection) =>
            collection.id === id && (collection.contains ?? false) !== holds
              ? {
                  ...collection,
                  contains: holds,
                  gameCount: collection.gameCount + (holds ? 1 : -1),
                }
              : collection,
          ),
        );
        return before;
      },
      onError: (_, { projectId }, before) => {
        queries.setQueryData(qk.myCollections(projectId), before);
      },
      onSettled: (_, __, { id }) => invalidateCollection(queries, id),
    }),
  );
}

export interface CollectionOrder {
  id: string;
  /** Every game the collection shows, in the order to give them. */
  projectIds: string[];
}

/** Puts a collection's games in the order given. */
export function injectReorderCollection(): CreateMutationResult<unknown, Error, CollectionOrder> {
  const queries = inject(QueryClient);
  return injectMutation<unknown, Error, CollectionOrder>(() => ({
    mutationFn: async ({ id, projectIds }) => {
      unwrap(await collectionsControllerReorder({ path: { id }, body: { projectIds } }));
    },
    onSettled: (_, __, { id }) => invalidateCollection(queries, id),
  }));
}
