import { presenceControllerFriends } from '@naucto/api-client';

import { unwrap } from '../api/api-errors';
import { type PresenceDto } from './presence.types';

/**
 * Presence REST, used to seed the store before the socket's snapshot arrives. Live updates come
 * over the notifications socket, not from here.
 */
export const presenceApi = {
  friends: async (): Promise<PresenceDto[]> => unwrap(await presenceControllerFriends()),
};
