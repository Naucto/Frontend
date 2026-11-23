import { userPublicControllerGetPublicProfile } from '@naucto/api-client';
import { type CreateQueryResult, injectQuery } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { qk } from './query-keys';

export function injectUserAvatar(id: () => string | null): CreateQueryResult<string | null> {
  return injectQuery(() => ({
    queryKey: qk.userAvatar(id()),
    enabled: id() !== null,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const current = id();
      if (current === null) {
        return null;
      }
      const res = unwrap(await userPublicControllerGetPublicProfile({ path: { id: current } }));
      return res.data.profileImageUrl ?? null;
    },
  }));
}
