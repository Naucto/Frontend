import { presenceControllerFriends, type PresenceDto } from '@naucto/api-client';

import { unwrap } from '../api/api-errors';

/**
 * Presence REST, used to seed the store before the socket's snapshot arrives. Live updates come
 * over the notifications socket, not from here.
 */
export const presenceApi = {
  friends: async (): Promise<PresenceDto[]> => unwrap(await presenceControllerFriends()),
};
