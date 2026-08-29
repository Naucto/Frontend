import { inject } from '@angular/core';
import { unwrap } from '@app/core/api/api-errors';
import { take } from '@app/core/api/take';
import { AuthStore } from '@app/core/auth/auth.store';
import {
  client,
  type ForkProjectResponseDto,
  type LikeResponseDto,
  projectControllerFork,
  projectControllerGetLikeStatus,
  projectControllerGetPublishedProjectImage,
  projectControllerGetRelease,
  projectControllerGetReleaseContentUrl,
  projectControllerLikeProject,
  projectControllerRegisterReleaseView,
  projectControllerUnlikeProject,
  type ProjectExResponseDto,
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

import { qk } from './query-keys';

export const RELEASE_PAGE_SIZE = 24;

export type SortMetric =
  'viewCount' | 'likes' | 'commentCount' | 'forkCount' | 'publishedAt' | 'uniquePlayers';

/** How the backend orders a release page; `trending` is plays weighted by recency. */
export type ReleaseSort = 'newest' | 'trending' | 'plays' | 'likes';

export interface ReleaseQuery {
  /** Free text over name, summary, tags and creator. */
  q?: string;
  sort?: ReleaseSort;
  /** Only games carrying this tag. */
  tag?: string;
}

interface ReleasePage {
  items: ProjectExResponseDto[];
  total: number;
}

/** A page that knows its own index, for the "show N more" shelf. */
interface NumberedReleasePage extends ReleasePage {
  page: number;
}

/**
 * All released games, paginated, searched and sorted by the backend — the shelves, the sort strip
 * and the search box all page over the whole catalogue rather than over one loaded page.
 */
export function injectReleasesPage(
  page: () => number,
  limit = RELEASE_PAGE_SIZE,
  query: () => ReleaseQuery = () => ({}),
): CreateQueryResult<ReleasePage> {
  return injectQuery(() => ({
    queryKey: qk.releases({ page: page(), limit, ...query() }),
    queryFn: async () => {
      const { q, sort, tag } = query();
      const res = await take<{ projects: ProjectExResponseDto[]; total: number }>(
        client.get({
          url: '/projects/releases/paginated',
          query: {
            page: page(),
            limit,
            ...(q ? { q } : {}),
            ...(sort ? { sort } : {}),
            ...(tag ? { tag } : {}),
          },
        }),
      );
      return { items: res.projects, total: res.total };
    },
    placeholderData: (prev: ReleasePage | undefined) => prev,
  }));
}

/** The editorially chosen game of the week, or null when nothing is featured. */
export function injectFeaturedRelease(): CreateQueryResult<ProjectExResponseDto | null> {
  return injectQuery(() => ({
    queryKey: qk.featuredRelease(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await take<{ featured?: { project?: ProjectExResponseDto } | null }>(
        client.get({ url: '/releases/featured' }),
      );
      return res.featured?.project ?? null;
    },
  }));
}

/** Releases by id, for shelves built from ids we hold locally (jump back in). */
export function injectReleasesByIds(
  ids: () => readonly number[],
): CreateQueryResult<ProjectExResponseDto[]> {
  return injectQuery(() => ({
    queryKey: qk.releasesByIds(ids()),
    enabled: ids().length > 0,
    queryFn: async () => {
      const found = await Promise.all(
        ids().map(async (id) => {
          try {
            return unwrap(await projectControllerGetRelease({ path: { id: String(id) } }));
          } catch {
            return null; // unpublished or deleted since it was played
          }
        }),
      );
      return found.filter((g): g is ProjectExResponseDto => g !== null);
    },
  }));
}

export function injectRelease(id: () => number): CreateQueryResult<ProjectExResponseDto> {
  return injectQuery(() => ({
    queryKey: qk.release(id()),
    enabled: id() > 0,
    queryFn: async () => unwrap(await projectControllerGetRelease({ path: { id: String(id()) } })),
  }));
}

/** Every released game, page after page ("SHOW N MORE"), searched and sorted by the backend. */
export function injectReleasesInfinite(
  limit = RELEASE_PAGE_SIZE,
  query: () => ReleaseQuery = () => ({}),
): CreateInfiniteQueryResult<InfiniteData<NumberedReleasePage, number>> {
  return injectInfiniteQuery(() => ({
    queryKey: qk.releases({ page: 'all', limit, ...query() }),
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<NumberedReleasePage> => {
      const { q, sort, tag } = query();
      const res = await take<{ projects: ProjectExResponseDto[]; total: number }>(
        client.get({
          url: '/projects/releases/paginated',
          query: {
            page: pageParam,
            limit,
            ...(q ? { q } : {}),
            ...(sort ? { sort } : {}),
            ...(tag ? { tag } : {}),
          },
        }),
      );
      return { items: res.projects, total: res.total, page: pageParam };
    },
    getNextPageParam: (last: NumberedReleasePage): number | undefined =>
      last.page * limit < last.total ? last.page + 1 : undefined,
  }));
}

/** Signed cover URL for a published game; null when the game has no cover. */
export function injectReleaseImage(id: () => number | null): CreateQueryResult<string | null> {
  return injectQuery(() => ({
    queryKey: qk.releaseImage(id() ?? -1),
    enabled: id() !== null,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const current = id();
      if (current === null) return null;
      const res = await projectControllerGetPublishedProjectImage({ path: { id: current } });
      if (!(res.response?.ok ?? false)) return null;
      const data = res.data as { url?: string } | undefined;
      return data?.url ?? null;
    },
  }));
}

export function injectReleaseContentUrl(id: () => number): CreateQueryResult<string> {
  return injectQuery(() => ({
    queryKey: qk.releaseContentUrl(id()),
    staleTime: 0,
    queryFn: async () =>
      unwrap(await projectControllerGetReleaseContentUrl({ path: { id: String(id()) } })).signedUrl,
  }));
}

export function injectLikeStatus(
  id: () => number,
): CreateQueryResult<{ likes: number; liked: boolean }> {
  const auth = inject(AuthStore);
  return injectQuery(() => ({
    queryKey: qk.likeStatus(id()),
    enabled: auth.isAuthenticated(),
    queryFn: async () =>
      unwrap(await projectControllerGetLikeStatus({ path: { id: String(id()) } })),
  }));
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred mutation type (context from onMutate)
export function injectToggleLike(id: () => number) {
  const qc = inject(QueryClient);
  return injectMutation<LikeResponseDto, Error, boolean, LikeResponseDto | undefined>(() => ({
    mutationFn: async (liked: boolean): Promise<LikeResponseDto> => {
      const res = liked
        ? await projectControllerUnlikeProject({ path: { id: String(id()) } })
        : await projectControllerLikeProject({ path: { id: String(id()) } });
      return unwrap(res);
    },
    onMutate: async (liked: boolean) => {
      await qc.cancelQueries({ queryKey: qk.likeStatus(id()) });
      const prev = qc.getQueryData<LikeResponseDto>(qk.likeStatus(id()));
      if (prev)
        qc.setQueryData(qk.likeStatus(id()), {
          likes: prev.likes + (liked ? -1 : 1),
          liked: !liked,
        });
      return prev;
    },
    onError: (_e, _v, prev) => {
      if (prev) qc.setQueryData(qk.likeStatus(id()), prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.likeStatus(id()) }),
  }));
}

export function injectFork(): CreateMutationResult<ForkProjectResponseDto, Error, number> {
  const qc = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (id: number) => unwrap(await projectControllerFork({ path: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  }));
}

export const registerView = (id: number): void => {
  void projectControllerRegisterReleaseView({ path: { id: String(id) } });
};

export const SORTERS: Record<
  SortMetric,
  (a: ProjectExResponseDto, b: ProjectExResponseDto) => number
> = {
  viewCount: (a, b) => b.viewCount - a.viewCount,
  likes: (a, b) => b.likes - a.likes,
  commentCount: (a, b) => (b.commentCount ?? 0) - (a.commentCount ?? 0),
  forkCount: (a, b) => (b.forkCount ?? 0) - (a.forkCount ?? 0),
  publishedAt: (a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''),
  uniquePlayers: (a, b) => b.uniquePlayers - a.uniquePlayers,
};

export const matchesSearch = (p: ProjectExResponseDto, q: string): boolean => {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    p.name.toLowerCase().includes(s) ||
    p.shortDesc.toLowerCase().includes(s) ||
    p.tags.some((t) => t.toLowerCase().includes(s)) ||
    p.creator.username.toLowerCase().includes(s)
  );
};
