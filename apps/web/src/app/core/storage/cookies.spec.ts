import { describe, expect, it } from 'vitest';

import { COOKIE_NAMES, readCookie, removeCookie, writeCookie } from './cookies';

/** A jar that records each assignment, which a real document never shows back. */
const jar = (initial = ''): { cookie: string; writes: string[] } => {
  const writes: string[] = [];
  return {
    writes,
    get cookie(): string {
      return initial;
    },
    set cookie(value: string) {
      writes.push(value);
    },
  };
};

describe('cookies', () => {
  it('reads one cookie among several, decoded', () => {
    const cookies = jar(`other=1; ${COOKIE_NAMES.consent}=%7B%22v%22%3A1%7D; naucto_vid=abc`);

    expect(readCookie(COOKIE_NAMES.consent, cookies)).toBe('{"v":1}');
    expect(readCookie(COOKIE_NAMES.visitor, cookies)).toBe('abc');
    expect(readCookie(COOKIE_NAMES.session, cookies)).toBeNull();
  });

  it('writes a first-party cookie for the whole site with its lifetime', () => {
    const cookies = jar();

    writeCookie(COOKIE_NAMES.visitor, 'abc', 3600, cookies, false);

    expect(cookies.writes).toEqual(['naucto_vid=abc; Max-Age=3600; Path=/; SameSite=Lax']);
  });

  it('marks it Secure on a secure origin', () => {
    const cookies = jar();

    writeCookie(COOKIE_NAMES.visitor, 'abc', 60, cookies, true);

    expect(cookies.writes[0]).toMatch(/; Secure$/);
  });

  it('removes a cookie by expiring it now', () => {
    const cookies = jar();

    removeCookie(COOKIE_NAMES.session, cookies, false);

    expect(cookies.writes).toEqual(['naucto_sid=; Max-Age=0; Path=/; SameSite=Lax']);
  });

  it('reads nothing, and throws nothing, when cookies are blocked', () => {
    const blocked = {
      get cookie(): string {
        throw new Error('blocked');
      },
      set cookie(_value: string) {
        throw new Error('blocked');
      },
    };

    expect(readCookie(COOKIE_NAMES.consent, blocked)).toBeNull();
    expect(() => {
      writeCookie(COOKIE_NAMES.consent, 'x', 1, blocked);
    }).not.toThrow();
  });
});
