import { userAnalyticsControllerSummary, type UserAnalyticsSummaryDto } from '@naucto/api-client';
import { type CreateQueryResult, injectQuery } from '@tanstack/angular-query-experimental';

import { unwrap } from '../../core/api/api-errors';
import { qk } from './query-keys';

/** What was counted for the signed-in account. */
export function injectMyAnalytics(): CreateQueryResult<UserAnalyticsSummaryDto> {
  return injectQuery(() => ({
    queryKey: qk.myAnalytics(),
    queryFn: async () => unwrap(await userAnalyticsControllerSummary()),
  }));
}
