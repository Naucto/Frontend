import { inject } from '@angular/core';
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
import { AuthStore } from '../../core/auth/auth.store';
import { qk } from './query-keys';

export function injectFriends(enabled: () => boolean = () => true): CreateQueryResult<FriendDto[]> {
  return injectQuery(() => ({
    queryKey: qk.friends(),
    queryFn: async () => unwrap(await friendsControllerList()),
    enabled: enabled(),
    retry: false,
  }));
}

/** The requests waiting for the viewer's answer; the ones the viewer sent are left out. */
export function injectFriendRequests(
  enabled: () => boolean,
): CreateQueryResult<FriendRequestDto[]> {
  const auth = inject(AuthStore);
  return injectQuery(() => {
    const viewer = auth.userId();
    return {
      queryKey: qk.friendRequests(),
      queryFn: async () => unwrap(await friendsControllerRequests()),
      select: (requests: FriendRequestDto[]) =>
        requests.filter((request) => request.to.id === viewer),
      enabled: enabled(),
    };
  });
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
