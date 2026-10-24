import { inject } from '@angular/core';
import {
  type CreateBugReportDto,
  type CreatedReportDto,
  type CreateRatingDto,
  type FeedbackPromptDto,
  reportsControllerAttachScreenshot,
  reportsControllerCreateBugReport,
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

export function injectSubmitBugReport(): CreateMutationResult<
  CreatedReportDto,
  Error,
  CreateBugReportDto
> {
  return injectMutation(() => ({
    mutationFn: async (body: CreateBugReportDto) =>
      unwrap(await reportsControllerCreateBugReport({ body })),
  }));
}

/** Attaches a screenshot to a bug report just sent. The server judges its size and type. */
export function injectAttachScreenshot(): CreateMutationResult<
  void,
  Error,
  { id: number; screenshot: Blob }
> {
  return injectMutation(() => ({
    mutationFn: async ({ id, screenshot }: { id: number; screenshot: Blob }) => {
      unwrap(await reportsControllerAttachScreenshot({ path: { id }, body: { screenshot } }));
    },
  }));
}
