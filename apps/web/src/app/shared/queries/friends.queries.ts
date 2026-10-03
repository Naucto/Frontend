import { unwrap } from '@app/core/api/api-errors';
import { type FriendDto, friendsControllerList } from '@naucto/api-client';
import { type CreateQueryResult, injectQuery } from '@tanstack/angular-query-experimental';

import { qk } from './query-keys';

export function injectFriends(enabled: () => boolean = () => true): CreateQueryResult<FriendDto[]> {
  return injectQuery(() => ({
    queryKey: qk.friends(),
    queryFn: async () => unwrap(await friendsControllerList()),
    enabled: enabled(),
    retry: false,
  }));
}
