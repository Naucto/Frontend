import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppConfigService } from '../config/app-config';
import { COOKIE_NAMES } from '../storage/cookies';
import {
  AnalyticsTransport,
  applyRotation,
  KEEPALIVE_BUDGET_BYTES,
  TransientTransportError,
} from './analytics-transport';

const realFetch = globalThis.fetch;

interface Sent {
  url: string;
  init: RequestInit;
}

const respond = (make: () => Response | Promise<Response>): Sent[] => {
  const sent: Sent[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: input instanceof Request ? input.url : input.toString(), init: init ?? {} });
    return make();
  };
  return sent;
};

/** A jar holding cookies as a browser would, ignoring their attributes. */
const jar = (initial: Record<string, string>): { cookie: string; values: Map<string, string> } => {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get cookie(): string {
      return [...values].map(([name, value]) => `${name}=${value}`).join('; ');
    },
    set cookie(assignment: string) {
      const [pair = '', ...attributes] = assignment.split('; ');
      const [name = '', value = ''] = pair.split('=');
      if (attributes.includes('Max-Age=0')) {
        values.delete(name);
      } else {
        values.set(name, value);
      }
    },
  };
};

describe('AnalyticsTransport', () => {
  const transport = (): AnalyticsTransport => TestBed.inject(AnalyticsTransport);

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AppConfigService,
          useValue: { config: () => ({ apiUrl: 'https://api.test' }) },
        },
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sends JSON as plain text, without credentials or an account', async () => {
    const sent = respond(() => Response.json({ rotateVisitor: false }));

    const answer = await transport().post('/analytics/beat', { state: 'BROWSING' });

    expect(answer).toEqual({ rotateVisitor: false });
    expect(sent).toHaveLength(1);
    const [{ url, init }] = sent as [Sent];
    expect(url).toBe('https://api.test/analytics/beat');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(init.headers).toEqual({ 'Content-Type': 'text/plain' });
    expect(init.body).toBe('{"state":"BROWSING"}');
  });

  it('keeps a request alive only within the unload budget', async () => {
    const sent = respond(() => new Response(null, { status: 204 }));

    await transport().post('/analytics/ping', { kind: 'FLUSH' }, { keepalive: true });
    await transport().post(
      '/analytics/events',
      { padding: 'x'.repeat(KEEPALIVE_BUDGET_BYTES) },
      { keepalive: true },
    );
    await transport().post('/analytics/ping', { kind: 'BEAT' });

    expect(sent.map(({ init }) => init.keepalive)).toEqual([true, false, false]);
  });

  it('answers null for an empty or refused answer, which is not worth sending again', async () => {
    respond(() => new Response(null, { status: 204 }));
    await expect(transport().post('/analytics/ping', {})).resolves.toBeNull();

    respond(() => new Response('{}', { status: 400 }));
    await expect(transport().post('/analytics/ping', {})).resolves.toBeNull();

    respond(() => new Response('{}', { status: 429 }));
    await expect(transport().post('/analytics/ping', {})).resolves.toBeNull();
  });

  it('fails transiently when the network or the server does', async () => {
    respond(() => Promise.reject(new TypeError('offline')));
    await expect(transport().post('/analytics/play', {})).rejects.toBeInstanceOf(
      TransientTransportError,
    );

    respond(() => new Response('{}', { status: 503 }));
    await expect(transport().post('/analytics/play', {})).rejects.toBeInstanceOf(
      TransientTransportError,
    );
  });
});

describe('applyRotation', () => {
  const sent = { visitorId: 'visitor-a', sessionId: 'session-a' };
  const holding = (visitorId: string, sessionId: string): ReturnType<typeof jar> =>
    jar({ [COOKIE_NAMES.visitor]: visitorId, [COOKIE_NAMES.session]: sessionId });

  it('does nothing when the server asks for nothing', () => {
    const cookies = holding('visitor-a', 'session-a');

    expect(applyRotation(sent, { rotateVisitor: false, rotateSession: false }, cookies)).toBe(
      'none',
    );
    expect(cookies.values.get(COOKIE_NAMES.visitor)).toBe('visitor-a');
  });

  it('rotates the visitor and its session while the cookies still hold the one sent', () => {
    const cookies = holding('visitor-a', 'session-a');

    expect(applyRotation(sent, { rotateVisitor: true, rotateSession: true }, cookies)).toBe(
      'visitor',
    );
    expect(cookies.values.get(COOKIE_NAMES.visitor)).not.toBe('visitor-a');
    expect(cookies.values.get(COOKIE_NAMES.session)).not.toBe('session-a');
  });

  it('rotates only the session when only the session is closed', () => {
    const cookies = holding('visitor-a', 'session-a');

    expect(applyRotation(sent, { rotateVisitor: false, rotateSession: true }, cookies)).toBe(
      'session',
    );
    expect(cookies.values.get(COOKIE_NAMES.visitor)).toBe('visitor-a');
    expect(cookies.values.get(COOKIE_NAMES.session)).not.toBe('session-a');
  });

  it('ignores a late answer about an identity that was already replaced', () => {
    const cookies = holding('visitor-b', 'session-b');

    expect(applyRotation(sent, { rotateVisitor: true, rotateSession: true }, cookies)).toBe(
      'stale',
    );
    expect(applyRotation(sent, { rotateVisitor: false, rotateSession: true }, cookies)).toBe(
      'stale',
    );
    expect(cookies.values.get(COOKIE_NAMES.visitor)).toBe('visitor-b');
    expect(cookies.values.get(COOKIE_NAMES.session)).toBe('session-b');
  });

  it('ignores a session answer once that session was replaced under the same visitor', () => {
    const cookies = holding('visitor-a', 'session-b');

    expect(applyRotation(sent, { rotateVisitor: false, rotateSession: true }, cookies)).toBe(
      'stale',
    );
    expect(cookies.values.get(COOKIE_NAMES.session)).toBe('session-b');
  });
});
