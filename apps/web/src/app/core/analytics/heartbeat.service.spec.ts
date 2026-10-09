import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../auth/auth.store';
import { FeaturesService } from '../config/features.service';
import { COOKIE_NAMES, readCookie, writeCookie } from '../storage/cookies';
import { ActivityService } from './activity.service';
import { AnalyticsTransport } from './analytics-transport';
import { BrowserAccountService } from './browser-account.service';
import { ConsentStore } from './consent.store';
import { ANONYMOUS_BEAT_MS, CONSENTED_BEAT_MS, HeartbeatService } from './heartbeat.service';

type ConsentStatus = 'unknown' | 'granted' | 'denied';

interface Posted {
  path: string;
  body: Record<string, unknown>;
}

const VISITOR = '11111111-1111-4111-8111-111111111111';

const clearCookies = (): void => {
  for (const name of Object.values(COOKIE_NAMES)) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
};

describe('HeartbeatService', () => {
  const consent = signal<ConsentStatus>('granted');
  const analytics = signal(true);
  const suspended = signal(false);
  const isAuthenticated = signal(false);
  const disableAnalytics = vi.fn();
  let visibility: DocumentVisibilityState;
  let posted: Posted[];
  let reply: unknown;

  const start = (): HeartbeatService => {
    const service = TestBed.inject(HeartbeatService);
    TestBed.tick();
    return service;
  };

  const setVisibility = (state: DocumentVisibilityState): void => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clearCookies();
    TestBed.resetTestingModule();
    consent.set('granted');
    analytics.set(true);
    suspended.set(false);
    isAuthenticated.set(false);
    disableAnalytics.mockClear();
    visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    posted = [];
    reply = null;
    writeCookie(COOKIE_NAMES.visitor, VISITOR, 3600);
    TestBed.configureTestingModule({
      providers: [
        { provide: ConsentStore, useValue: { status: consent } },
        { provide: FeaturesService, useValue: { analytics, disableAnalytics } },
        { provide: BrowserAccountService, useValue: { suspended } },
        { provide: AuthStore, useValue: { isAuthenticated } },
        {
          provide: AnalyticsTransport,
          useValue: {
            post: async (path: string, body: Record<string, unknown>) => {
              posted.push({ path, body });
              return reply;
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    vi.useRealTimers();
    clearCookies();
  });

  it('beats under the visitor at once, then every 45 seconds', async () => {
    start();
    expect(posted).toHaveLength(1);
    expect(posted[0]?.path).toBe('/analytics/beat');
    expect(posted[0]?.body).toMatchObject({ visitorId: VISITOR, state: 'BROWSING' });
    expect(posted[0]?.body.sessionId).toBe(readCookie(COOKIE_NAMES.session));

    await vi.advanceTimersByTimeAsync(CONSENTED_BEAT_MS * 2);
    expect(posted).toHaveLength(3);
  });

  it('reports the current activity and its game', () => {
    TestBed.inject(ActivityService).claim({ state: 'PLAYING', releaseId: 9 });
    start();

    expect(posted[0]?.body).toMatchObject({ state: 'PLAYING', releaseId: 9 });
  });

  it('pings without any identifier when there is no consent, every minute', async () => {
    consent.set('unknown');
    isAuthenticated.set(true);
    start();

    expect(posted[0]).toEqual({
      path: '/analytics/ping',
      body: { kind: 'BEAT', state: 'BROWSING', signedIn: true, releaseId: undefined },
    });
    expect(readCookie(COOKIE_NAMES.session)).toBeNull();

    await vi.advanceTimersByTimeAsync(ANONYMOUS_BEAT_MS - 1);
    expect(posted).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(posted).toHaveLength(2);
  });

  it('pings anonymously while the tab is suspended', () => {
    suspended.set(true);
    start();

    expect(posted.map(({ path }) => path)).toEqual(['/analytics/ping']);
  });

  it('sends nothing with analytics off', async () => {
    analytics.set(false);
    start();
    await vi.advanceTimersByTimeAsync(ANONYMOUS_BEAT_MS * 2);

    expect(posted).toHaveLength(0);
  });

  it('stops while hidden, and beats on return once the interval has passed', async () => {
    start();
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(CONSENTED_BEAT_MS * 3);
    expect(posted).toHaveLength(1);

    setVisibility('visible');
    expect(posted).toHaveLength(2);
  });

  it('does not beat again on a quick return', async () => {
    start();
    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(1_000);
    setVisibility('visible');

    expect(posted).toHaveLength(1);
  });

  it('switches to pings when consent is withdrawn, without beating twice', async () => {
    start();
    consent.set('denied');
    TestBed.tick();
    expect(posted).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(ANONYMOUS_BEAT_MS);
    expect(posted.map(({ path }) => path)).toEqual(['/analytics/beat', '/analytics/ping']);
  });

  it('applies a rotation the server asks for', async () => {
    reply = { rotateVisitor: true, rotateSession: true, disabled: false };
    start();
    await vi.advanceTimersByTimeAsync(0);

    expect(readCookie(COOKIE_NAMES.visitor)).not.toBe(VISITOR);
  });

  it('turns analytics off when the server says it is off', async () => {
    reply = { rotateVisitor: false, rotateSession: false, disabled: true };
    start();
    await vi.advanceTimersByTimeAsync(0);

    expect(disableAnalytics).toHaveBeenCalled();
  });
});
