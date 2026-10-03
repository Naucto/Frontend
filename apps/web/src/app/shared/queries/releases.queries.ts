import { inject } from '@angular/core';
import {
  featuredReleaseControllerGetFeatured,
  type ForkProjectResponseDto,
  hubControllerFork,
  hubControllerGetLikeStatus,
  hubControllerGetPaginatedReleases,
  hubControllerGetPublishedProjectImage,
  hubControllerGetRelease,
  hubControllerLikeProject,
  hubControllerRegisterReleaseView,
  hubControllerUnlikeProject,
  type ImageUrlResponseDto,
  type LikeResponseDto,
  projectContentControllerGetReleaseContentUrl,
  projectControllerGetProjectImage,
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

import { unwrap } from '../../core/api/api-errors';
import { take } from '../../core/api/take';
import { AuthStore } from '../../core/auth/auth.store';
import { qk } from './query-keys';

export const RELEASE_PAGE_SIZE = 24;

export type SortMetric = 'viewCount' | 'uniquePlayers';

export type ReleaseSort = 'fresh' | 'popular' | 'liked' | 'discussed' | 'name';

export interface ReleaseQuery {
  /** Free text over name, summary, tags and creator. */
  search?: string;
  sort?: ReleaseSort;
  /** Comma-separated; a game must carry all of them. */
  tags?: string;
}

/**
 * A release query as the endpoint names it. The endpoint ignores a parameter it does not know, so a
 * wrong name fails silently.
 */
export const releaseParams = (query: ReleaseQuery): Record<string, string> => ({
  ...(query.search ? { search: query.search } : {}),
  ...(query.sort ? { sort: query.sort } : {}),
  ...(query.tags ? { tags: query.tags } : {}),
});

interface ReleasePage {
  items: ProjectExResponseDto[];
  total: number;
}

/** A page that knows its own index, for the "show N more" shelf. */
interface NumberedReleasePage extends ReleasePage {
  page: number;
}

/** One page of released games, searched and sorted by the backend. */
export function injectReleasesPage(
  page: () => number,
  limit = RELEASE_PAGE_SIZE,
  query: () => ReleaseQuery = () => ({}),
): CreateQueryResult<ReleasePage> {
  return injectQuery(() => ({
    queryKey: qk.releases({ page: page(), limit, ...query() }),
    queryFn: async () => {
      const res = unwrap(
        await hubControllerGetPaginatedReleases({
          query: { page: page(), limit, ...releaseParams(query()) },
        }),
      );
      return { items: res.projects, total: res.total };
    },
    placeholderData: (prev: ReleasePage | undefined) => prev,
  }));
}

/**
 * How many recent releases a page reads to derive remixes, collaborations or related games itself,
 * for want of an endpoint that answers those questions. It is the first page only, so what is
 * derived from it is a sample: anything older than the window is missing, silently.
 */
const RELATED_WINDOW = 48;

/** The partial window above, shared by every page that derives a related shelf from it. */
export function injectRelatedWindow(): CreateQueryResult<ReleasePage> {
  return injectReleasesPage(() => 1, RELATED_WINDOW);
}

/** The editorially chosen game of the week, or null when nothing is featured. */
export function injectFeaturedRelease(): CreateQueryResult<ProjectExResponseDto | null> {
  return injectQuery(() => ({
    queryKey: qk.featuredRelease(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = unwrap(await featuredReleaseControllerGetFeatured());
      return res.featured?.project ?? null;
    },
  }));
}

export function injectRelease(id: () => number): CreateQueryResult<ProjectExResponseDto> {
  return injectQuery(() => ({
    queryKey: qk.release(id()),
    enabled: id() > 0,
    queryFn: async () => unwrap(await hubControllerGetRelease({ path: { id: String(id()) } })),
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
      const res = unwrap(
        await hubControllerGetPaginatedReleases({
          query: { page: pageParam, limit, ...releaseParams(query()) },
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
      if (current === null) {
        return null;
      }
      const res = await hubControllerGetPublishedProjectImage({ path: { id: current } });
      // 404 is this endpoint's own "not published, or nothing to show"; anything else is a
      // failure, and a failure cached as an empty shelf outlives whatever went wrong.
      if (res.response?.status === 404) {
        return null;
      }
      return unwrap(res).url ?? null;
    },
  }));
}

/**
 * Cover of a project at any stage, which is the one a draft has — its release twin answers only
 * once the game has been published.
 *
 * Authenticated, so it is for a reader looking at their own work rather than for the shelves.
 */
export function injectProjectImage(id: () => number | null): CreateQueryResult<string | null> {
  return injectQuery(() => ({
    queryKey: qk.projectImage(id() ?? -1),
    enabled: id() !== null,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const current = id();
      if (current === null) {
        return null;
      }
      // No image at all answers 204, which arrives as an empty body; a 403 is a refusal and a 401
      // an expired token, and neither is a game with no cover.
      const res = await take<ImageUrlResponseDto>(
        projectControllerGetProjectImage({ path: { id: current } }),
      );
      return res.url ?? null;
    },
  }));
}

export function injectReleaseContentUrl(id: () => number): CreateQueryResult<string> {
  return injectQuery(() => ({
    queryKey: qk.releaseContentUrl(id()),
    staleTime: 0,
    queryFn: async () =>
      unwrap(await projectContentControllerGetReleaseContentUrl({ path: { id: String(id()) } }))
        .signedUrl,
  }));
}

export function injectLikeStatus(
  id: () => number,
): CreateQueryResult<{ likes: number; liked: boolean }> {
  const auth = inject(AuthStore);
  return injectQuery(() => ({
    queryKey: qk.likeStatus(id()),
    enabled: auth.isAuthenticated(),
    queryFn: async () => unwrap(await hubControllerGetLikeStatus({ path: { id: String(id()) } })),
  }));
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred mutation type (context from onMutate)
export function injectToggleLike(id: () => number) {
  const qc = inject(QueryClient);
  return injectMutation<LikeResponseDto, Error, boolean, LikeResponseDto | undefined>(() => ({
    mutationFn: async (liked: boolean): Promise<LikeResponseDto> => {
      const res = liked
        ? await hubControllerUnlikeProject({ path: { id: String(id()) } })
        : await hubControllerLikeProject({ path: { id: String(id()) } });
      return unwrap(res);
    },
    onMutate: async (liked: boolean) => {
      await qc.cancelQueries({ queryKey: qk.likeStatus(id()) });
      const prev = qc.getQueryData<LikeResponseDto>(qk.likeStatus(id()));
      if (prev) {
        qc.setQueryData(qk.likeStatus(id()), {
          likes: prev.likes + (liked ? -1 : 1),
          liked: !liked,
        });
      }
      return prev;
    },
    onError: (_e, _v, prev) => {
      if (prev) {
        qc.setQueryData(qk.likeStatus(id()), prev);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.likeStatus(id()) }),
  }));
}

export function injectFork(): CreateMutationResult<ForkProjectResponseDto, Error, number> {
  const qc = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (id: number) => unwrap(await hubControllerFork({ path: { id } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.projectsAll() }),
  }));
}

export const registerView = (id: number): void => {
  void hubControllerRegisterReleaseView({ path: { id: String(id) } });
};

export const SORTERS: Record<
  SortMetric,
  (a: ProjectExResponseDto, b: ProjectExResponseDto) => number
> = {
  viewCount: (a, b) => b.viewCount - a.viewCount,
  uniquePlayers: (a, b) => b.uniquePlayers - a.uniquePlayers,
};
