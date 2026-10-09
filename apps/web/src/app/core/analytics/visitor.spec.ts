import { beforeEach, describe, expect, it } from 'vitest';

import { randomId } from './random-id';
import {
  clearIdentity,
  currentIdentity,
  ensureVisitorId,
  rotateSession,
  rotateVisitor,
  touchSession,
} from './visitor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A jar holding cookies as a browser would, ignoring their attributes. */
const jar = (): { cookie: string; values: Map<string, string> } => {
  const values = new Map<string, string>();
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

describe('visitor identity', () => {
  let cookies: ReturnType<typeof jar>;

  beforeEach(() => {
    cookies = jar();
  });

  it('writes the visitor id once and keeps it', () => {
    const first = ensureVisitorId(cookies);

    expect(first).toMatch(UUID);
    expect(ensureVisitorId(cookies)).toBe(first);
  });

  it('keeps a session while it is touched and starts one when there is none', () => {
    const session = touchSession(cookies);

    expect(touchSession(cookies)).toBe(session);
    expect(rotateSession(cookies)).not.toBe(session);
  });

  it('reads an identity only when both ids exist, creating nothing', () => {
    expect(currentIdentity(cookies)).toBeNull();
    expect(cookies.values.size).toBe(0);

    const visitorId = ensureVisitorId(cookies);
    const sessionId = touchSession(cookies);

    expect(currentIdentity(cookies)).toEqual({ visitorId, sessionId });
  });

  it('starts a new visitor and session together', () => {
    const before = { visitorId: ensureVisitorId(cookies), sessionId: touchSession(cookies) };

    const after = rotateVisitor(cookies);

    expect(after.visitorId).not.toBe(before.visitorId);
    expect(after.sessionId).not.toBe(before.sessionId);
    expect(currentIdentity(cookies)).toEqual(after);
  });

  it('forgets both ids', () => {
    ensureVisitorId(cookies);
    touchSession(cookies);

    clearIdentity(cookies);

    expect(cookies.values.size).toBe(0);
  });
});

describe('randomId', () => {
  it('builds a version 4 uuid without crypto.randomUUID, as on a plain-http origin', () => {
    const native = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      expect(randomId()).toMatch(UUID);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: native, configurable: true });
    }
  });
});
