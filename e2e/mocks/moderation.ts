import type { Page } from '@playwright/test';

import { answer } from './session';

/** Turns the backend's `moderation` feature on, which is what makes any of it show. */
export async function mockModeration(page: Page): Promise<void> {
  await page.route(
    '**/features',
    answer(200, { monetization: false, analytics: false, moderation: true }),
  );
}

export const SUSPENSION = {
  since: '2026-11-20T09:30:00.000Z',
  until: '2026-12-04T09:30:00.000Z',
};

const decision = (id: number, over: Record<string, unknown>): Record<string, unknown> => ({
  id,
  action: 'COMMENT_HIDDEN',
  targetType: 'COMMENT',
  targetId: id,
  targetLabel: null,
  reason: null,
  message: null,
  expiresAt: null,
  createdAt: '2026-11-18T16:05:00.000Z',
  ...over,
});

/** Thirteen decisions, newest first: a suspension, a warning, a hidden game, then removed comments. */
export const DECISIONS = [
  decision(13, {
    action: 'ACCOUNT_SUSPENDED',
    targetType: 'USER',
    targetLabel: 'alexis',
    reason: 'HARASSMENT',
    message: 'Third comment aimed at the same player this week.',
    expiresAt: SUSPENSION.until,
    createdAt: SUSPENSION.since,
  }),
  decision(12, {
    action: 'ACCOUNT_WARNED',
    targetType: 'USER',
    targetLabel: 'alexis',
    reason: 'HARASSMENT',
    message: 'Keep it about the game, not about who made it.',
    createdAt: '2026-11-19T11:20:00.000Z',
  }),
  decision(11, {
    action: 'PROJECT_HIDDEN',
    targetType: 'PROJECT',
    targetLabel: 'Neon Drift',
    reason: 'STOLEN_CONTENT',
    message: 'The sprites are taken from another game on the hub.',
  }),
  ...Array.from({ length: 10 }, (_, i) =>
    decision(10 - i, {
      targetLabel: `buy cheap coins ${String(10 - i)}`,
      reason: 'SPAM',
      message: 'Advertising is not allowed in comments.',
      createdAt: `2026-11-${String(17 - i).padStart(2, '0')}T08:00:00.000Z`,
    }),
  ),
];

/**
 * The standing of the signed-in account, a page at a time. Returns the query of every page that
 * was asked, in order.
 */
export async function mockStanding(
  page: Page,
  standing: { suspension?: Record<string, unknown> | null; warnings?: number } = {},
): Promise<string[]> {
  const asked: string[] = [];
  await page.route('**/moderation/standing**', (route) => {
    const url = new URL(route.request().url());
    asked.push(url.search);
    const number = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 10);
    return route.fulfill({
      json: {
        suspension: standing.suspension ?? null,
        warnings: standing.warnings ?? 0,
        items: DECISIONS.slice((number - 1) * limit, number * limit),
        total: DECISIONS.length,
        page: number,
        limit,
      },
    });
  });
  return asked;
}

/** The comments of a game, as its first page answers them. */
export async function mockComments(
  page: Page,
  projectId: number,
  comments: Record<string, unknown>[],
): Promise<void> {
  await page.route(
    `**/projects/${String(projectId)}/comments**`,
    answer(200, { comments, total: comments.length, page: 1, limit: 20 }),
  );
}

/** Takes every report and answers it as received. Returns the body of each, in order. */
export async function mockFlags(page: Page): Promise<unknown[]> {
  const sent: unknown[] = [];
  await page.route('**/moderation/flags', (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, json: { id: sent.length } });
  });
  return sent;
}
