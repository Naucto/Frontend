import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COOKIE_NAMES, readCookie, writeCookie } from '../storage/cookies';
import { CONSENT_MAX_AGE_MS, ConsentStore, readConsent } from './consent.store';

const clearCookies = (): void => {
  for (const name of Object.values(COOKIE_NAMES)) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
};

const storeConsent = (analytics: boolean, at: number): void => {
  writeCookie(COOKIE_NAMES.consent, JSON.stringify({ v: 1, analytics, at }), 3600);
};

describe('ConsentStore', () => {
  const store = (): InstanceType<typeof ConsentStore> => TestBed.inject(ConsentStore);

  beforeEach(() => {
    clearCookies();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearCookies();
  });

  it('starts unknown, with no identity, before any choice', () => {
    expect(store().status()).toBe('unknown');
    expect(readCookie(COOKIE_NAMES.visitor)).toBeNull();
  });

  it('remembers a yes and only then creates the visitor cookie', () => {
    store().grant();

    expect(store().status()).toBe('granted');
    expect(readConsent().status).toBe('granted');
    expect(readCookie(COOKIE_NAMES.visitor)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('forgets the identity on a no', () => {
    store().grant();
    writeCookie(COOKIE_NAMES.session, 'some-session', 60);

    store().deny();

    expect(store().status()).toBe('denied');
    expect(readCookie(COOKIE_NAMES.visitor)).toBeNull();
    expect(readCookie(COOKIE_NAMES.session)).toBeNull();
  });

  it('drops a visitor cookie left behind without a current yes', () => {
    writeCookie(COOKIE_NAMES.visitor, 'stale-visitor', 3600);

    expect(store().status()).toBe('unknown');
    expect(readCookie(COOKIE_NAMES.visitor)).toBeNull();
  });

  it('asks again once a choice is six months old', () => {
    storeConsent(true, Date.now() - CONSENT_MAX_AGE_MS - 1);

    expect(readConsent().status).toBe('unknown');
  });

  it('lets a choice lapse in a tab left open past its age', () => {
    vi.useFakeTimers();
    const decidedAt = Date.now() - CONSENT_MAX_AGE_MS + 60_000;
    storeConsent(true, decidedAt);
    writeCookie(COOKIE_NAMES.visitor, 'visitor', 3600);
    expect(store().status()).toBe('granted');

    vi.advanceTimersByTime(60_001);

    expect(store().status()).toBe('unknown');
    expect(readCookie(COOKIE_NAMES.visitor)).toBeNull();
  });

  it('follows a choice another tab made', () => {
    expect(store().status()).toBe('unknown');
    storeConsent(false, Date.now());

    store().sync();

    expect(store().status()).toBe('denied');
  });

  it('reads an unreadable cookie as no choice', () => {
    writeCookie(COOKIE_NAMES.consent, 'not json', 60);

    expect(readConsent()).toEqual({ status: 'unknown', decidedAt: null });
  });
});
