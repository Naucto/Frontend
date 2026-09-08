import { unwrap } from '@app/core/api/api-errors';
import { userPublicControllerGetPublicProfile } from '@naucto/api-client';
import { type CreateQueryResult, injectQuery } from '@tanstack/angular-query-experimental';

import { qk } from './query-keys';

export function injectUserAvatar(id: () => number | null): CreateQueryResult<string | null> {
  return injectQuery(() => ({
    queryKey: qk.userAvatar(id() ?? -1),
    enabled: (id() ?? 0) > 0,
    // A picture changes far less often than the lists that show it.
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const res = unwrap(await userPublicControllerGetPublicProfile({ path: { id: id() ?? -1 } }));
      return res.data.profileImageUrl ?? null;
    },
  }));
}
