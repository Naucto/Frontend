import { inject } from '@angular/core';
import {
  type CreatedFlagDto,
  type CreateFlagDto,
  moderationControllerCreateFlag,
  moderationControllerStanding,
  type StandingDto,
} from '@naucto/api-client';
import {
  type CreateMutationResult,
  type CreateQueryResult,
  injectMutation,
  injectQuery,
  keepPreviousData,
} from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { qk } from './query-keys';

export const STANDING_PAGE_SIZE = 10;

/** Reports a game, a comment or a profile to the moderators. The code calls a report a flag. */
export function injectFlagContent(): CreateMutationResult<CreatedFlagDto, Error, CreateFlagDto> {
  return injectMutation(() => ({
    mutationFn: async (body: CreateFlagDto) =>
      unwrap(await moderationControllerCreateFlag({ body })),
  }));
}

/** What moderation decided about the signed-in account and what it made, newest first. */
export function injectStanding(page: () => number): CreateQueryResult<StandingDto> {
  const auth = inject(AuthStore);
  return injectQuery(() => ({
    queryKey: qk.standing(page()),
    queryFn: async () =>
      unwrap(
        await moderationControllerStanding({ query: { page: page(), limit: STANDING_PAGE_SIZE } }),
      ),
    enabled: auth.isAuthenticated(),
    placeholderData: keepPreviousData,
  }));
}
