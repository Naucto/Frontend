import { computed, inject, type Signal } from '@angular/core';
import { take } from '@app/core/api/take';
import { AuthStore } from '@app/core/auth/auth.store';
import { client, type ProjectExResponseDto } from '@naucto/api-client';
import { type CreateQueryResult, injectQuery } from '@tanstack/angular-query-experimental';

/** How many of each kind the panel shows before the full results page takes over. */
const PER_SECTION = 3;
const TAGS_SHOWN = 6;
const TAGS_ONLY_SHOWN = 8;

export interface PersonHit {
  id: number;
  username: string;
  nickname?: string | null;
  profileImageUrl?: string | null;
}

export interface SessionHit {
  sessionUuid: string;
  title: string;
  projectId: number;
  projectName: string;
  hostUsername: string;
  hostNickname?: string | null;
  playerCount: number;
  maxPlayers: number;
}

export interface TagHit {
  tag: string;
  count: number;
}

export interface Suggestions {
  games: ProjectExResponseDto[];
  people: PersonHit[];
  sessions: SessionHit[];
  tags: TagHit[];
}

const EMPTY: Suggestions = { games: [], people: [], sessions: [], tags: [] };

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
      queryKey: ['search', 'suggest', term, tagsOnly, signedIn],
      enabled: term.length > 0,
      staleTime: 30_000,
      queryFn: async (): Promise<Suggestions> => {
        const tags = take<{ tags: TagHit[] }>(
          client.get({
            url: '/projects/releases/tags',
            query: { q: term, limit: tagsOnly ? TAGS_ONLY_SHOWN : TAGS_SHOWN },
          }),
        );

        if (tagsOnly) return { ...EMPTY, tags: (await tags).tags };

        const games = take<{ projects: ProjectExResponseDto[] }>(
          client.get({
            url: '/projects/releases/paginated',
            query: { search: term, limit: PER_SECTION, page: 1, sort: 'popular' },
          }),
        );
        const people = take<{ data: PersonHit[] }>(
          client.get({ url: '/users/public/search', query: { q: term, limit: PER_SECTION } }),
        );
        // A visitor is not refused this list, they are simply not shown one.
        const sessions = signedIn
          ? take<{ sessions: SessionHit[] }>(
              client.get({ url: '/game-sessions', query: { q: term } }),
            )
          : Promise.resolve({ sessions: [] });

        const [g, p, s, t] = await Promise.all([games, people, sessions, tags]);
        return {
          games: g.projects.slice(0, PER_SECTION),
          people: p.data.slice(0, PER_SECTION),
          sessions: s.sessions.slice(0, PER_SECTION),
          tags: t.tags,
        };
      },
    };
  });
}
