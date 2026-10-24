import { inject } from '@angular/core';
import {
  type CreatedReportDto,
  type CreateRatingDto,
  type FeedbackPromptDto,
  reportsControllerCreateRating,
  reportsControllerPrompt,
  reportsControllerUpdatePrompt,
  type UpdateFeedbackPromptDto,
} from '@naucto/api-client';
import {
  type CreateMutationResult,
  type CreateQueryResult,
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { AuthStore } from '../../core/auth/auth.store';
import { qk } from './query-keys';

/** Whether the rating prompt may ask the signed-in account now. */
export function injectFeedbackPrompt(): CreateQueryResult<FeedbackPromptDto> {
  const auth = inject(AuthStore);
  return injectQuery(() => ({
    queryKey: qk.feedbackPrompt(),
    queryFn: async () => unwrap(await reportsControllerPrompt()),
    enabled: auth.isAuthenticated(),
    staleTime: Infinity,
  }));
}

export function injectUpdateFeedbackPrompt(): CreateMutationResult<
  FeedbackPromptDto,
  Error,
  UpdateFeedbackPromptDto
> {
  const queries = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (body: UpdateFeedbackPromptDto) =>
      unwrap(await reportsControllerUpdatePrompt({ body })),
    onSuccess: (state: FeedbackPromptDto) => {
      queries.setQueryData(qk.feedbackPrompt(), state);
    },
  }));
}

export function injectSubmitRating(): CreateMutationResult<
  CreatedReportDto,
  Error,
  CreateRatingDto
> {
  const queries = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (body: CreateRatingDto) =>
      unwrap(await reportsControllerCreateRating({ body })),
    onSuccess: () => {
      queries.setQueryData<FeedbackPromptDto>(qk.feedbackPrompt(), (state) =>
        state ? { ...state, eligible: false } : state,
      );
    },
  }));
}
