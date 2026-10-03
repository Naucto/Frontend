import { computed, inject, type Signal } from '@angular/core';
import {
  type GameSessionResponseDto,
  hubControllerGetPaginatedReleases,
  hubControllerGetReleaseTags,
  multiplayerControllerList,
  type ProjectExResponseDto,
  type PublicUserSearchHitDto,
  type ReleaseTagDto,
  userPublicControllerSearch,
} from '@naucto/api-client';
import { type CreateQueryResult, injectQuery } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { qk } from './query-keys';

/** How many of each kind the panel shows before the full results page takes over. */
const PER_SECTION = 3;
const TAGS_SHOWN = 6;
const TAGS_ONLY_SHOWN = 8;

export type PersonHit = PublicUserSearchHitDto;

export type SessionHit = GameSessionResponseDto;

export type TagHit = ReleaseTagDto;

export interface Suggestions {
  games: ProjectExResponseDto[];
  people: PersonHit[];
  sessions: SessionHit[];
  tags: TagHit[];
}

const EMPTY: Suggestions = { games: [], people: [], sessions: [], tags: [] };

/**
 * People matching what was typed, handle and display name alike, case-insensitively.
 *
 * The one place that knows this endpoint, because the alternative -- `GET /users?nickname=` --
 * matches the display name only and matches it case-sensitively, which is indistinguishable from
 * a search that does not work.
 */
export async function searchPeople(term: string, limit: number): Promise<PersonHit[]> {
  const page = unwrap(await userPublicControllerSearch({ query: { q: term, limit } }));
  return page.data.slice(0, limit);
}

/**
 * One kind's answer, or an empty list when its request fails, so one refused section never takes
 * the others down with it.
 */
async function section<T, R>(request: Promise<T>, read: (value: T) => R[]): Promise<R[]> {
  try {
    return read(await request);
  } catch {
    return [];
  }
}

/**
 * What was typed, read as either a search or the literal-tag operator.
 *
 * A leading `#` is the operator rather than a character: the panel narrows to tags and ENTER lands
 * on everything carrying one, so `#` is never part of the term it searches for.
 */
export interface ParsedTerm {
  term: string;
  tagsOnly: boolean;
}

export function parseTerm(raw: string): ParsedTerm {
  const trimmed = raw.trim();
  return trimmed.startsWith('#')
    ? { term: trimmed.slice(1).trim(), tagsOnly: true }
    : { term: trimmed, tagsOnly: false };
}

/**
 * The four kinds a search offers, fetched together.
 *
 * Live sessions are the one kind that needs a signed-in caller — who may see a session depends on
 * whose friend the host is — so a visitor gets three sections rather than a section that lies.
 */
export function injectSuggestions(query: Signal<string>): CreateQueryResult<Suggestions> {
  const auth = inject(AuthStore);
  const parsed = computed(() => parseTerm(query()));

  return injectQuery(() => {
    const { term, tagsOnly } = parsed();
    const signedIn = auth.user() !== null;

    return {
      queryKey: qk.searchSuggest(term, tagsOnly, signedIn),
      enabled: term.length > 0,
      staleTime: 30_000,
      queryFn: async (): Promise<Suggestions> => {
        const tags = section(
          hubControllerGetReleaseTags({
            query: { q: term, limit: tagsOnly ? TAGS_ONLY_SHOWN : TAGS_SHOWN },
          }).then(unwrap),
          (tagsResponse) => tagsResponse.tags,
        );

        if (tagsOnly) {
          return { ...EMPTY, tags: await tags };
        }

        const games = section(
          hubControllerGetPaginatedReleases({
            query: { search: term, limit: PER_SECTION, page: 1, sort: 'popular' },
          }).then(unwrap),
          (releasesResponse) => releasesResponse.projects.slice(0, PER_SECTION),
        );
        const people = section(searchPeople(term, PER_SECTION), (hits) => hits);
        const sessions = signedIn
          ? section(
              multiplayerControllerList({ query: { q: term } }).then(unwrap),
              (sessionsResponse) => sessionsResponse.sessions.slice(0, PER_SECTION),
            )
          : Promise.resolve([]);

        const [resolvedGames, resolvedPeople, resolvedSessions, resolvedTags] = await Promise.all([
          games,
          people,
          sessions,
          tags,
        ]);
        return {
          games: resolvedGames,
          people: resolvedPeople,
          sessions: resolvedSessions,
          tags: resolvedTags,
        };
      },
    };
  });
}
