/**
 * Hand-typed calls for endpoints the Backend stack adds (friends, presence,
 * account settings — B3 … B7). They ride the generated client (base URL, auth,
 * refresh) and get replaced by the generated SDK once those PRs land.
 * TODO(NCTO-redesign): delete when @naucto/api-client ships these operations.
 */
import { client, type ProjectExResponseDto } from '@naucto/api-client';

import { ApiError } from './api-errors';

/** Narrow a raw client result to its payload, or throw the API error. */
async function take<T>(
  p: Promise<{ data?: unknown; error?: unknown; response?: Response }>,
): Promise<T> {
  const r = await p;
  const ok = r.response?.ok ?? r.error === undefined;
  if (r.error !== undefined || !ok) {
    const body = r.error as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : (body?.message ?? r.response?.statusText ?? '');
    throw new ApiError(r.response?.status ?? 0, message || 'Request failed');
  }
  return r.data as T;
}

export interface UserSummaryDto {
  id: number;
  username: string;
  nickname?: string | null;
}

export interface FriendDto extends UserSummaryDto {
  /** When the friendship was made. */
  since: string;
  /** Last time they were seen online; absent until the presence PR persists it. */
  lastSeenAt?: string | null;
}

export interface FriendRequestDto {
  id: number;
  from: UserSummaryDto;
  to: UserSummaryDto;
  mutuals?: number;
  playedYourGame?: boolean;
  createdAt: string;
}

export type PresenceKind = 'IDLE' | 'PLAYING' | 'BUILDING' | 'HOSTING';

export interface PresenceDto {
  userId: number;
  kind: PresenceKind;
  releaseId?: number | null;
  projectId?: number | null;
  sessionId?: string | null;
  title?: string | null;
  players?: number | null;
  maxPlayers?: number | null;
  joinable?: boolean;
  since: string;
}

export interface RecentPlayerDto extends UserSummaryDto {
  game: string;
  playedAt: string;
  friend: boolean;
}

export type JoinPolicy = 'ANYONE' | 'FRIENDS' | 'CODE_ONLY';

export interface MeDto {
  friendCode: string;
  sessionJoinPolicy: JoinPolicy;
}

export const friendsApi = {
  list: async (): Promise<FriendDto[]> => take<FriendDto[]>(client.get({ url: '/friends' })),
  requests: async (): Promise<FriendRequestDto[]> =>
    take<FriendRequestDto[]>(client.get({ url: '/friends/requests' })),
  send: async (body: { userId?: number; friendCode?: string }): Promise<void> => {
    await take<unknown>(client.post({ url: '/friends/requests', body }));
  },
  accept: async (id: number): Promise<void> => {
    await take<unknown>(client.post({ url: `/friends/requests/${String(id)}/accept` }));
  },
  decline: async (id: number): Promise<void> => {
    await take<unknown>(client.delete({ url: `/friends/requests/${String(id)}` }));
  },
  remove: async (userId: number): Promise<void> => {
    await take<unknown>(client.delete({ url: `/friends/${String(userId)}` }));
  },
  recentPlayers: async (): Promise<RecentPlayerDto[]> =>
    take<RecentPlayerDto[]>(client.get({ url: '/friends/recent-players' })),
  presence: async (): Promise<PresenceDto[]> =>
    take<PresenceDto[]>(client.get({ url: '/presence/friends' })),
  friendship: async (userId: number): Promise<{ status: 'NONE' | 'PENDING' | 'FRIENDS' }> =>
    take<{ status: 'NONE' | 'PENDING' | 'FRIENDS' }>(
      client.get({ url: `/users/${String(userId)}/friendship` }),
    ),
};

export interface ProfileShelfCounts {
  gameCount: number;
  totalPlays: number;
  totalLikes: number;
}

export const usersApi = {
  /** Games this person is a collaborator on, but does not own. */
  collaborations: async (userId: number): Promise<ProjectExResponseDto[]> =>
    take<ProjectExResponseDto[]>(
      client.get({ url: `/users/public/${String(userId)}/collaborations` }),
    ),
  /** Games other people forked from theirs. */
  remixes: async (userId: number): Promise<ProjectExResponseDto[]> =>
    take<ProjectExResponseDto[]>(client.get({ url: `/users/public/${String(userId)}/remixes` })),

  /**
   * People matching a nickname. `GET /users` filters on nickname today; the free-text `q` that
   * covers usernames and tags arrives with the release-search PR, and this is the one call site
   * that has to change when it does.
   */
  search: async (nickname: string): Promise<UserSummaryDto[]> => {
    const page = await take<{ data?: UserSummaryDto[] } | UserSummaryDto[]>(
      client.get({ url: '/users', query: { nickname, limit: 10 } }),
    );
    return Array.isArray(page) ? page : (page.data ?? []);
  },
};

export const meApi = {
  get: async (): Promise<MeDto> => take<MeDto>(client.get({ url: '/users/me' })),
  update: async (patch: Partial<MeDto>): Promise<MeDto> =>
    take<MeDto>(client.patch({ url: '/users/me', body: patch })),
  regenerateFriendCode: async (): Promise<MeDto> =>
    take<MeDto>(client.post({ url: '/users/me/friend-code/regenerate' })),
  deleteAccount: async (body: {
    confirmation: 'DELETE';
    removePublishedGames: boolean;
  }): Promise<void> => {
    await take<unknown>(client.delete({ url: '/users/me', body }));
  },
};
