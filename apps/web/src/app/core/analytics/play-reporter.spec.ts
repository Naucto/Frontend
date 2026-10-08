import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AnalyticsPlayDto } from '@naucto/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../auth/auth.store';
import { FeaturesService } from '../config/features.service';
import { COOKIE_NAMES, readCookie, writeCookie } from '../storage/cookies';
import type { AnalyticsMode } from './analytics-mode.service';
import { AnalyticsModeService } from './analytics-mode.service';
import { AnalyticsTransport, TransientTransportError } from './analytics-transport';
import { MAX_PING_PLAY_MS, PLAY_RETRY_DELAYS_MS, PlayReporter } from './play-reporter';
import { PlayClock } from './play-tracker';

interface Posted {
  path: string;
  body: Record<string, unknown>;
  keepalive: boolean;
}

const VISITOR = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const OK = { rotateVisitor: false, rotateSession: false, disabled: false, status: 'ok' };

const clearCookies = (): void => {
  for (const name of Object.values(COOKIE_NAMES)) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
};

describe('PlayReporter', () => {
  const mode = signal<AnalyticsMode>('consented');
  const disableAnalytics = vi.fn();
  let posted: Posted[];
  let reply: (path: string) => Promise<unknown>;
  let reporter: PlayReporter;
  let clock: PlayClock;

  const plays = (): AnalyticsPlayDto[] =>
    posted
      .filter(({ path }) => path === '/analytics/play')
      .map(({ body }) => body as unknown as AnalyticsPlayDto);
  const pings = (): Record<string, unknown>[] =>
    posted.filter(({ path }) => path === '/analytics/ping').map(({ body }) => body);

  const play = (ms: number): void => {
    vi.advanceTimersByTime(ms);
  };

  const begin = async (): Promise<void> => {
    clock = new PlayClock(() => Date.now());
    clock.run();
    reporter.begin(5, clock);
    await vi.advanceTimersByTimeAsync(0);
  };

  const setMode = async (next: AnalyticsMode): Promise<void> => {
    mode.set(next);
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    clearCookies();
    TestBed.resetTestingModule();
    mode.set('consented');
    disableAnalytics.mockClear();
    posted = [];
    reply = async (path) => (path === '/analytics/play' ? OK : null);
    writeCookie(COOKIE_NAMES.visitor, VISITOR, 3600);
    writeCookie(COOKIE_NAMES.session, SESSION, 3600);
    TestBed.configureTestingModule({
      providers: [
        { provide: AnalyticsModeService, useValue: { mode } },
        { provide: AuthStore, useValue: { isAuthenticated: () => false } },
        { provide: FeaturesService, useValue: { disableAnalytics } },
        {
          provide: AnalyticsTransport,
          useValue: {
            post: (
              path: string,
              body: Record<string, unknown>,
              options?: { keepalive?: boolean },
            ) => {
              posted.push({ path, body, keepalive: options?.keepalive === true });
              return reply(path);
            },
          },
        },
      ],
    });
    reporter = TestBed.inject(PlayReporter);
    TestBed.tick();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    clearCookies();
  });

  describe('with consent', () => {
    it('reports the start at once, under the visitor', async () => {
      await begin();

      expect(plays()).toEqual([
        {
          visitorId: VISITOR,
          sessionId: SESSION,
          phase: 'START',
          endReason: undefined,
          play: expect.objectContaining({ releaseId: 5, continued: false, activeMs: 0 }),
        },
      ]);
    });

    it('reports cumulative running time on beats, then at the end', async () => {
      await begin();
      play(30_000);
      const report = reporter.consentedReport({ visitorId: VISITOR, sessionId: SESSION });
      play(15_000);
      reporter.end('stopped');

      expect(report).toMatchObject({ activeMs: 30_000, startAgeMs: 30_000 });
      expect(plays()[1]).toMatchObject({
        phase: 'END',
        endReason: 'stopped',
        play: { playId: report?.playId, activeMs: 45_000 },
      });
    });

    it('gives a beat under another identity nothing to carry', async () => {
      await begin();

      expect(
        reporter.consentedReport({ visitorId: VISITOR, sessionId: 'another-session' }),
      ).toBeUndefined();
    });

    it('closes the stretch under the old identity and continues under the new one', async () => {
      await begin();
      play(20_000);
      writeCookie(COOKIE_NAMES.session, '33333333-3333-4333-8333-333333333333', 3600);

      reporter.sync();
      await vi.advanceTimersByTimeAsync(0);

      const [start, end, next] = plays();
      expect(end).toMatchObject({
        sessionId: SESSION,
        phase: 'END',
        endReason: 'rotated',
        play: { playId: start?.play.playId, activeMs: 20_000 },
      });
      expect(next).toMatchObject({
        sessionId: '33333333-3333-4333-8333-333333333333',
        phase: 'START',
        play: { continued: true, activeMs: 0 },
      });
      expect(next?.play.playId).not.toBe(start?.play.playId);
    });

    it('counts the play under the new identity when the first was refused before storing it', async () => {
      reply = async (path) => (path === '/analytics/play' ? { ...OK, rotateSession: true } : null);
      await begin();
      expect(readCookie(COOKIE_NAMES.session)).not.toBe(SESSION);

      reply = async () => OK;
      reporter.sync();
      await vi.advanceTimersByTimeAsync(0);

      expect(plays().map(({ phase, play: report }) => [phase, report.continued])).toEqual([
        ['START', false],
        ['START', false],
      ]);
    });

    it('stops reporting a game the server refuses', async () => {
      reply = async () => ({ ...OK, status: 'rejected' });
      await begin();

      reporter.sync();
      await vi.advanceTimersByTimeAsync(0);

      expect(plays()).toHaveLength(1);
      expect(reporter.consentedReport({ visitorId: VISITOR, sessionId: SESSION })).toBeUndefined();
    });

    it('retries the start while the server cannot be reached', async () => {
      let failures = 2;
      reply = async () => {
        if (failures-- > 0) {
          throw new TransientTransportError('offline');
        }
        return OK;
      };
      await begin();
      await vi.advanceTimersByTimeAsync(PLAY_RETRY_DELAYS_MS[0] + PLAY_RETRY_DELAYS_MS[1]);

      const ids = plays().map((report) => report.play.playId);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(1);
    });

    it('hands the rest to the browser as the page goes away, and continues if it comes back', async () => {
      await begin();
      play(10_000);

      reporter.exit();
      reporter.sync();
      await vi.advanceTimersByTimeAsync(0);

      const [, end, next] = plays();
      expect(posted.find(({ body }) => body === (end as unknown))?.keepalive).toBe(true);
      expect(end).toMatchObject({ phase: 'END', endReason: 'pagehide' });
      expect(next).toMatchObject({ phase: 'START', play: { continued: true } });
    });
  });

  describe('without consent', () => {
    beforeEach(async () => {
      await setMode('anonymous');
    });

    it('counts the play with a ping that carries no identifier', async () => {
      await begin();

      expect(posted).toEqual([
        {
          path: '/analytics/ping',
          body: {
            kind: 'PLAY_START',
            state: 'PLAYING',
            signedIn: false,
            releaseId: 5,
            playMs: undefined,
          },
          keepalive: false,
        },
      ]);
    });

    it('hands running time over once per ping, and the rest at the end', async () => {
      await begin();
      play(20_000);
      const first = reporter.takeAnonymousMs();
      const again = reporter.takeAnonymousMs();
      play(7_000);
      reporter.end('stopped');

      expect([first, again]).toEqual([20_000, undefined]);
      expect(pings().at(-1)).toMatchObject({ kind: 'FLUSH', playMs: 7_000 });
    });

    it('caps what one ping may carry', async () => {
      await begin();
      play(MAX_PING_PLAY_MS * 2);

      expect(reporter.takeAnonymousMs()).toBe(MAX_PING_PLAY_MS);
    });
  });

  describe('when consent changes mid-play', () => {
    it('flushes the anonymous time and continues under the visitor, counted once', async () => {
      await setMode('anonymous');
      await begin();
      play(20_000);

      await setMode('consented');
      play(10_000);
      reporter.end('stopped');
      await vi.advanceTimersByTimeAsync(0);

      expect(pings().map((ping) => [ping.kind, ping.playMs])).toEqual([
        ['PLAY_START', undefined],
        ['FLUSH', 20_000],
      ]);
      expect(
        plays().map(({ phase, play: report }) => [phase, report.continued, report.activeMs]),
      ).toEqual([
        ['START', true, 0],
        ['END', true, 10_000],
      ]);
    });

    it('hands over only what the visitor stretch did not send when consent is withdrawn', async () => {
      await begin();
      play(60_000);
      reporter.consentedReport({ visitorId: VISITOR, sessionId: SESSION });
      play(5_000);

      await setMode('anonymous');
      play(8_000);
      reporter.end('stopped');

      expect(pings().map((ping) => [ping.kind, ping.playMs])).toEqual([
        ['FLUSH', 5_000],
        ['FLUSH', 8_000],
      ]);
      expect(plays()).toHaveLength(1);
    });

    it('stops reporting when analytics is turned off', async () => {
      await begin();
      await setMode('off');
      play(5_000);
      reporter.end('stopped');

      expect(posted).toHaveLength(1);
    });
  });

  it('counts a view under the visitor only with consent', async () => {
    reporter.registerView(5);
    await setMode('anonymous');
    reporter.registerView(6);

    expect(posted.map(({ path, body }) => [path, body])).toEqual([
      ['/projects/releases/5/view', { visitorId: VISITOR }],
      ['/projects/releases/6/view', {}],
    ]);
  });

  it('turns analytics off when the server says it is off', async () => {
    reply = async () => ({ ...OK, disabled: true });
    await begin();

    expect(disableAnalytics).toHaveBeenCalled();
  });
});
