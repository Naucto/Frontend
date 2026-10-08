import type { BrowserContext, Page, Request } from '@playwright/test';

import { expect, test } from './fixtures';
import { serveGame } from './mocks/game';
import { answer, mockSignedIn } from './mocks/session';

interface Sent {
  path: string;
  body: Record<string, unknown>;
  authorization: string | undefined;
}

type Replies = Partial<Record<string, (body: Record<string, unknown>) => unknown>>;

const PROCEED = { rotateVisitor: false, rotateSession: false, disabled: false };
const INGEST = /\/(analytics\/(events|play|beat|ping|link)|projects\/releases\/\d+\/view)$/;

const SUMMARY = {
  tracked: true,
  linkedBrowsers: 1,
  lifetime: { plays: 2, playtimeMs: 600_000 },
  thisMonth: { plays: 1, playtimeMs: 300_000 },
  gamesPlayed: 1,
  topGames: [],
  lastActiveAt: null,
  lastActiveIsExact: true,
};

const defaultReply = (path: string): unknown => {
  if (path.endsWith('/events')) {
    return { ...PROCEED, accepted: [], rejected: [] };
  }
  if (path.endsWith('/play')) {
    return { ...PROCEED, status: 'ok' };
  }
  if (path.endsWith('/beat')) {
    return PROCEED;
  }
  if (path.endsWith('/link')) {
    return { status: 'linked' };
  }
  return null;
};

/** Records every usage report the page sends, and answers it as the server would. */
async function collect(page: Page, replies: Replies = {}): Promise<Sent[]> {
  const sent: Sent[] = [];
  await page.route(INGEST, (route) => {
    const request: Request = route.request();
    const path = new URL(request.url()).pathname;
    const body = JSON.parse(request.postData() ?? '{}') as Record<string, unknown>;
    sent.push({ path, body, authorization: request.headers().authorization });
    const reply = replies[path]?.(body) ?? defaultReply(path);
    return reply === null
      ? route.fulfill({ status: 204 })
      : route.fulfill({ json: reply as Record<string, unknown> });
  });
  return sent;
}

async function analyticsOn(page: Page, on = true): Promise<void> {
  await page.route('**/features', answer(200, { monetization: false, analytics: on }));
}

async function consent(context: BrowserContext, analytics: boolean): Promise<void> {
  const value = encodeURIComponent(JSON.stringify({ v: 1, analytics, at: Date.now() }));
  await context.addCookies([{ name: 'naucto_consent', value, url: 'http://localhost:3001' }]);
}

async function cookie(context: BrowserContext, name: string): Promise<string | undefined> {
  return (await context.cookies()).find((entry) => entry.name === name)?.value;
}

/** Waits for the page the app routed to, then sends what is queued as it would on its way out. */
async function flush(page: Page): Promise<void> {
  await expect(page.getByRole('link', { name: 'Privacy' }).first()).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
}

const paths = (sent: Sent[], path: string): Sent[] => sent.filter((entry) => entry.path === path);

/** The visitor a page view of `route` was reported under. */
const visitorOf = (sent: Sent[], route: string): unknown =>
  paths(sent, '/analytics/events').find(({ body }) =>
    (body.events as { route: string }[]).some((event) => event.route === route),
  )?.body.visitorId;

test.describe('consent and usage analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/refresh', answer(401, {}));
  });

  test('refusing stores the choice and nothing else', async ({ page, context }) => {
    await analyticsOn(page);
    await collect(page);
    await page.goto('/hub');

    const banner = page.getByRole('region', { name: 'Usage analytics' });
    await banner.getByRole('button', { name: 'Refuse' }).click();

    await expect(banner).toBeHidden();
    expect((await context.cookies()).map(({ name }) => name)).toEqual(['naucto_consent']);
  });

  test('before any choice, the tab only sends pings without an identifier', async ({
    page,
    context,
  }) => {
    await analyticsOn(page);
    const sent = await collect(page);
    await page.goto('/hub');

    await expect.poll(() => paths(sent, '/analytics/ping').length).toBeGreaterThan(0);
    await flush(page);
    for (const { path, body, authorization } of sent) {
      expect(path).toBe('/analytics/ping');
      expect(body).not.toHaveProperty('visitorId');
      expect(body).not.toHaveProperty('sessionId');
      expect(authorization).toBeUndefined();
    }
    expect(await context.cookies()).toEqual([]);
  });

  test('after accepting, each new page is one view under one visitor', async ({
    page,
    context,
  }) => {
    await analyticsOn(page);
    const sent = await collect(page);
    await page.goto('/hub');
    await page
      .getByRole('region', { name: 'Usage analytics' })
      .getByRole('button', { name: 'Accept' })
      .click();
    await flush(page);
    await page.goto('/play/1');
    await flush(page);
    await page.goto('/play/2');
    await flush(page);

    await expect
      .poll(() =>
        paths(sent, '/analytics/events')
          .flatMap(({ body }) => body.events as { route: string }[])
          .map(({ route }) => route),
      )
      .toEqual(['hub', 'play/:id', 'play/:id']);
    const visitor = await cookie(context, 'naucto_vid');
    for (const { body, authorization } of paths(sent, '/analytics/events')) {
      expect(body.visitorId).toBe(visitor);
      expect(authorization).toBeUndefined();
    }
  });

  test('pressing Play reports the start at once, counts a view, and reports the end', async ({
    page,
    context,
  }) => {
    await serveGame(page, 'function _update() end');
    await analyticsOn(page);
    await consent(context, true);
    const sent = await collect(page);
    await page.goto('/play/42');

    await page.getByRole('button', { name: 'Play' }).first().click();
    await expect.poll(() => paths(sent, '/analytics/play').length).toBe(1);
    const visitor = await cookie(context, 'naucto_vid');
    expect(paths(sent, '/analytics/play')[0]?.body).toMatchObject({
      visitorId: visitor,
      phase: 'START',
      play: { releaseId: 42, continued: false },
    });
    await expect
      .poll(() => paths(sent, '/projects/releases/42/view').map(({ body }) => body))
      .toEqual([{ visitorId: visitor }]);

    await flush(page);
    await expect
      .poll(() => paths(sent, '/analytics/play').map(({ body }) => [body.phase, body.endReason]))
      .toEqual([
        ['START', undefined],
        ['END', 'pagehide'],
      ]);
  });

  test('erasing in one tab gives every tab a fresh visitor', async ({ page, context }) => {
    await mockSignedIn(page);
    await analyticsOn(page);
    await consent(context, true);
    await page.route('**/users/me/analytics', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ json: { erasedBrowsers: 1 } })
        : route.fulfill({ json: SUMMARY }),
    );
    const sent = await collect(page);
    const other = await context.newPage();
    await mockSignedIn(other);
    await analyticsOn(other);
    const otherSent = await collect(other);
    await other.goto('/hub');
    await page.goto('/settings/privacy');
    await expect.poll(() => paths(sent, '/analytics/link').length).toBeGreaterThan(0);
    const before = await cookie(context, 'naucto_vid');

    await page.getByRole('button', { name: 'Erase' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Erase' }).click();

    await expect.poll(() => cookie(context, 'naucto_vid')).not.toBe(before);
    const after = await cookie(context, 'naucto_vid');
    await expect
      .poll(() => paths(sent, '/analytics/link').at(-1)?.body)
      .toEqual({ visitorId: after });

    await other.getByRole('link', { name: 'Privacy' }).first().click();
    await expect(other.getByRole('heading', { name: 'Privacy' })).toBeVisible();
    await flush(other);
    await expect.poll(() => visitorOf(otherSent, 'privacy')).toBe(after);
  });

  test('a visitor the server refuses is replaced once, whatever answers come late', async ({
    page,
    context,
  }) => {
    await analyticsOn(page);
    await consent(context, true);
    let refused: unknown;
    const refuse = (body: Record<string, unknown>): unknown =>
      body.visitorId === refused ? { ...PROCEED, rotateVisitor: true } : undefined;
    const sent = await collect(page, {
      '/analytics/beat': refuse,
      '/analytics/events': (body) => {
        const verdict = refuse(body);
        return verdict ? { ...verdict, accepted: [], rejected: [] } : undefined;
      },
    });
    await page.route('**/analytics/beat', async (route) => {
      refused ??= (JSON.parse(route.request().postData() ?? '{}') as { visitorId: string })
        .visitorId;
      await route.fallback();
    });
    await page.goto('/hub');
    await expect.poll(() => paths(sent, '/analytics/beat').length).toBe(1);
    await expect.poll(() => cookie(context, 'naucto_vid')).not.toBe(refused);
    const replacement = await cookie(context, 'naucto_vid');

    await flush(page);
    await expect.poll(() => paths(sent, '/analytics/events').length).toBe(1);
    expect(await cookie(context, 'naucto_vid')).toBe(replacement);

    await page.getByRole('link', { name: 'Privacy' }).first().click();
    await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
    await flush(page);
    await expect.poll(() => visitorOf(sent, 'privacy')).toBe(replacement);
  });

  test('a tab signed in as another account than the browser stops and refreshes', async ({
    page,
    context,
  }) => {
    await mockSignedIn(page, { id: 1 });
    await analyticsOn(page);
    await consent(context, true);
    const sent = await collect(page);
    await page.goto('/hub');
    await expect.poll(() => paths(sent, '/analytics/link').length).toBe(1);
    const visitor = await cookie(context, 'naucto_vid');
    await expect(page.getByRole('link', { name: 'Privacy' }).first()).toBeVisible();

    await page.unroute('**/auth/refresh');
    const refreshed = page.waitForRequest('**/auth/refresh');
    await page.route('**/auth/refresh', answer(401, {}));
    await page.evaluate(() => {
      new BroadcastChannel('naucto-analytics').postMessage({ type: 'account-changed', userId: 2 });
    });

    await refreshed;
    await expect(page.getByRole('dialog')).toContainText('You have been signed out');
    expect(await cookie(context, 'naucto_vid')).toBe(visitor);
    expect(paths(sent, '/analytics/link')).toHaveLength(1);
  });

  test('the OAuth popup shows no banner and sends nothing', async ({ page }) => {
    await analyticsOn(page);
    const sent = await collect(page);
    await page.goto('/oauth/callback?code=abc&state=xyz');

    await page.waitForTimeout(1_500);
    await expect(page.getByRole('region', { name: 'Usage analytics' })).toHaveCount(0);
    expect(sent).toEqual([]);
  });

  test('with analytics off there is no banner and nothing is sent, but history stays visible', async ({
    page,
  }) => {
    await mockSignedIn(page);
    await analyticsOn(page, false);
    await page.route('**/users/me/analytics', answer(200, SUMMARY));
    const sent = await collect(page);
    await page.goto('/settings/privacy');

    await expect(page.getByText('Linked browsers')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Usage analytics' })).toHaveCount(0);
    await flush(page);
    await page.waitForTimeout(500);
    expect(sent).toEqual([]);
  });
});
