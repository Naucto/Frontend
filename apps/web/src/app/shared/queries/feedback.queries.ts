import { inject } from '@angular/core';
import {
  type CreatedFeedbackDto,
  type CreateRatingDto,
  feedbackControllerCreateBugReport,
  type FeedbackControllerCreateBugReportData,
  feedbackControllerCreateRating,
  feedbackControllerPrompt,
  feedbackControllerUpdatePrompt,
  type FeedbackPromptStateDto,
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
import { FeaturesService } from '../../core/config/features.service';
import { qk } from './query-keys';

export type BugReportBody = FeedbackControllerCreateBugReportData['body'];

/** Whether the rating prompt may ask the signed-in account now; idle while feedback is off. */
export function injectFeedbackPrompt(): CreateQueryResult<FeedbackPromptStateDto> {
  const auth = inject(AuthStore);
  const features = inject(FeaturesService);
  return injectQuery(() => ({
    queryKey: qk.feedbackPrompt(),
    queryFn: async () => unwrap(await feedbackControllerPrompt()),
    enabled: features.feedback() && auth.isAuthenticated(),
    staleTime: Infinity,
  }));
}

export function injectUpdateFeedbackPrompt(): CreateMutationResult<
  FeedbackPromptStateDto,
  Error,
  UpdateFeedbackPromptDto['action']
> {
  const queries = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (action: UpdateFeedbackPromptDto['action']) =>
      unwrap(await feedbackControllerUpdatePrompt({ body: { action } })),
    onSuccess: (state: FeedbackPromptStateDto) => {
      queries.setQueryData(qk.feedbackPrompt(), state);
    },
  }));
}

export function injectSubmitRating(): CreateMutationResult<
  CreatedFeedbackDto,
  Error,
  CreateRatingDto
> {
  const queries = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (body: CreateRatingDto) =>
      unwrap(await feedbackControllerCreateRating({ body })),
    onSuccess: () => {
      queries.setQueryData<FeedbackPromptStateDto>(qk.feedbackPrompt(), (state) =>
        state ? { ...state, eligible: false } : state,
      );
    },
  }));
}

export function injectSubmitBugReport(): CreateMutationResult<
  CreatedFeedbackDto,
  Error,
  BugReportBody
> {
  return injectMutation(() => ({
    mutationFn: async (body: BugReportBody) =>
      unwrap(await feedbackControllerCreateBugReport({ body })),
  }));
}
