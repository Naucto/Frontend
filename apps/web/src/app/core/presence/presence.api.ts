import { client } from '@naucto/api-client';

import { take } from '../api/take';
import { type PresenceDto } from './presence.types';

/**
 * Presence REST, used to seed before the socket's snapshot arrives and for a single user on a
 * profile page. Live updates come over the notifications socket, not from here.
 */
export const presenceApi = {
  friends: async (): Promise<PresenceDto[]> =>
    take<PresenceDto[]>(client.get({ url: '/presence/friends' })),
  of: async (userId: number): Promise<PresenceDto | null> =>
    take<PresenceDto | null>(client.get({ url: `/users/${String(userId)}/presence` })),
};
