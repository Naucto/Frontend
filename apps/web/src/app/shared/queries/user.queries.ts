import { unwrap } from '@app/core/api/api-errors';
import { userPublicControllerGetPublicProfile } from '@naucto/api-client';
import { type CreateQueryResult, injectQuery } from '@tanstack/angular-query-experimental';

import { qk } from './query-keys';

/**
 * A person's picture, from their profile — the one place that knows it.
 *
 * Listings do not carry it: a game card, a comment and a friend row name a person by id, and the
 * URL is looked up from that. Several avatars of the same person on a page are one request, and it
 * is held long: a picture changes far less often than the lists that show it.
 */
export function injectUserAvatar(id: () => number | null): CreateQueryResult<string | null> {
  return injectQuery(() => ({
    queryKey: qk.userAvatar(id() ?? -1),
    enabled: (id() ?? 0) > 0,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const res = unwrap(await userPublicControllerGetPublicProfile({ path: { id: id() ?? -1 } }));
      return res.data.profileImageUrl ?? null;
    },
  }));
}
