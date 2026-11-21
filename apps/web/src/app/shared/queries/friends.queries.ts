import {
  type FriendDto,
  type FriendRequestDto,
  friendsControllerAccept,
  friendsControllerDecline,
  friendsControllerList,
  friendsControllerRequests,
} from '@naucto/api-client';
import {
  type CreateQueryResult,
  injectQuery,
  type QueryClient,
} from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { qk } from './query-keys';

export function injectFriends(enabled: () => boolean = () => true): CreateQueryResult<FriendDto[]> {
  return injectQuery(() => ({
    queryKey: qk.friends(),
    queryFn: async () => unwrap(await friendsControllerList()),
    enabled: enabled(),
    retry: false,
  }));
}

/** Every request still waiting for an answer, the ones the viewer sent included. */
export function injectFriendRequests(
  enabled: () => boolean = () => true,
): CreateQueryResult<FriendRequestDto[]> {
  return injectQuery(() => ({
    queryKey: qk.friendRequests(),
    queryFn: async () => unwrap(await friendsControllerRequests()),
    enabled: enabled(),
  }));
}

/** Accepts or declines a request, then refreshes every friends query: it leaves each list it was in. */
export async function answerFriendRequest(
  queries: QueryClient,
  id: number,
  accept: boolean,
): Promise<void> {
  unwrap(await (accept ? friendsControllerAccept : friendsControllerDecline)({ path: { id } }));
  await queries.invalidateQueries({ queryKey: qk.friends() });
}
