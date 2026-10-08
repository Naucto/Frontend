import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FeaturesService } from '../config/features.service';
import { COOKIE_NAMES, readCookie, writeCookie } from '../storage/cookies';
import { AnalyticsService } from './analytics.service';
import { AnalyticsTransport } from './analytics-transport';
import { BrowserAccountService } from './browser-account.service';
import { ConsentStore } from './consent.store';

@Component({ template: '' })
class BlankPage {}

type ConsentStatus = 'unknown' | 'granted' | 'denied';

interface Posted {
  path: string;
  body: {
    visitorId: string;
    sessionId: string;
    context: { viewportWidth?: number };
    events: { route: string }[];
  };
  options: { keepalive?: boolean };
}

const clearCookies = (): void => {
  for (const name of Object.values(COOKIE_NAMES)) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
};

describe('AnalyticsService', () => {
  const consent = signal<ConsentStatus>('granted');
  const analytics = signal(true);
  const suspended = signal(false);
  const disableAnalytics = vi.fn();
  let posted: Posted[];
  let reply: unknown;

  const start = async (): Promise<Router> => {
    TestBed.inject(AnalyticsService);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/hub');
    TestBed.tick();
    return router;
  };

  /** What leaves as the page goes away: everything queued, in one request per identity. */
  const routesSent = (): string[] => {
    window.dispatchEvent(new Event('pagehide'));
    return posted.flatMap(({ body }) => body.events.map((event) => event.route));
  };

  beforeEach(() => {
    clearCookies();
    TestBed.resetTestingModule();
    consent.set('granted');
    analytics.set(true);
    suspended.set(false);
    disableAnalytics.mockClear();
    posted = [];
    reply = null;
    writeCookie(COOKIE_NAMES.visitor, '11111111-1111-4111-8111-111111111111', 3600);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'hub', component: BlankPage },
          { path: 'play/:id', component: BlankPage },
          { path: 'oauth', children: [{ path: 'callback', component: BlankPage }] },
        ]),
        { provide: ConsentStore, useValue: { status: consent } },
        { provide: FeaturesService, useValue: { analytics, disableAnalytics } },
        { provide: BrowserAccountService, useValue: { suspended } },
        {
          provide: AnalyticsTransport,
          useValue: {
            post: async (path: string, body: Posted['body'], options: Posted['options'] = {}) => {
              posted.push({ path, body, options });
              return reply;
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    clearCookies();
  });

  it('counts each new path once, by its route template', async () => {
    const router = await start();
    await router.navigateByUrl('/play/1');
    await router.navigateByUrl('/play/1?fullscreen=1');
    await router.navigateByUrl('/play/2');

    expect(routesSent()).toEqual(['hub', 'play/:id', 'play/:id']);
    expect(posted[0]?.path).toBe('/analytics/events');
    expect(posted[0]?.options.keepalive).toBe(true);
  });

  it('stamps each view with the visitor and a live session', async () => {
    await start();

    routesSent();
    expect(posted[0]?.body.visitorId).toBe('11111111-1111-4111-8111-111111111111');
    expect(posted[0]?.body.sessionId).toBe(readCookie(COOKIE_NAMES.session));
  });

  it('sends the viewport with every batch', async () => {
    await start();

    routesSent();
    expect(posted[0]?.body.context.viewportWidth).toBe(window.innerWidth);
  });

  it('counts nothing in the OAuth popup', async () => {
    const router = await start();
    await router.navigateByUrl('/oauth/callback');

    expect(routesSent()).toEqual(['hub']);
  });

  it('counts nothing without consent, and the page once consent is given', async () => {
    consent.set('unknown');
    const router = await start();
    await router.navigateByUrl('/play/1');
    expect(routesSent()).toEqual([]);

    consent.set('granted');
    TestBed.tick();

    expect(routesSent()).toEqual(['play/:id']);
  });

  it('forgets what was waiting when consent is withdrawn', async () => {
    await start();
    consent.set('denied');
    TestBed.tick();

    expect(routesSent()).toEqual([]);
  });

  it('counts nothing while the tab is suspended or analytics is off', async () => {
    suspended.set(true);
    const router = await start();
    analytics.set(false);
    suspended.set(false);
    TestBed.tick();
    await router.navigateByUrl('/play/1');

    expect(routesSent()).toEqual([]);
  });

  it('turns analytics off when the server says it is off', async () => {
    reply = {
      rotateVisitor: false,
      rotateSession: false,
      disabled: true,
      accepted: [],
      rejected: [],
    };
    const router = await start();
    for (let index = 0; index < 20; index += 1) {
      await router.navigateByUrl(`/play/${String(index)}`);
    }
    await vi.waitFor(() => {
      expect(disableAnalytics).toHaveBeenCalled();
    });
  });
});
