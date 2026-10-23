import { inject } from '@angular/core';
import {
  type CreatedFeedbackDto,
  type CreateRatingDto,
  type FeedbackContext,
  feedbackControllerCreateBugReport,
  type FeedbackControllerCreateBugReportData,
  feedbackControllerCreateRating,
  feedbackControllerPrompt,
  feedbackControllerUpdatePrompt,
  type FeedbackPromptsDto,
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

/** The key of a context's state in the prompt's answer. */
export const promptKey = (context: FeedbackContext): keyof FeedbackPromptsDto =>
  context === 'CREATOR' ? 'creator' : 'player';

/** Whether the rating prompt may ask the signed-in account now, idle while feedback is off. */
export function injectFeedbackPrompt(): CreateQueryResult<FeedbackPromptsDto> {
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
  FeedbackPromptsDto,
  Error,
  UpdateFeedbackPromptDto
> {
  const queries = inject(QueryClient);
  return injectMutation(() => ({
    mutationFn: async (body: UpdateFeedbackPromptDto) =>
      unwrap(await feedbackControllerUpdatePrompt({ body })),
    onSuccess: (state: FeedbackPromptsDto) => {
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
    onSuccess: (_created: CreatedFeedbackDto, body: CreateRatingDto) => {
      const key = promptKey(body.context);
      queries.setQueryData<FeedbackPromptsDto>(qk.feedbackPrompt(), (state) =>
        state ? { ...state, [key]: { ...state[key], eligible: false } } : state,
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
