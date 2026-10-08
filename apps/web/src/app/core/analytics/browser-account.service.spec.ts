import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthStore } from '../auth/auth.store';
import { FeaturesService } from '../config/features.service';
import { COOKIE_NAMES, readCookie, writeCookie } from '../storage/cookies';
import type { LinkStatus } from './analytics.api';
import { AnalyticsApi } from './analytics.api';
import { BrowserAccountService } from './browser-account.service';
import { ANALYTICS_CHANNEL, ConsentStore } from './consent.store';

type AuthStatus = 'booting' | 'anonymous' | 'authenticated';
type ConsentStatus = 'unknown' | 'granted' | 'denied';

const clearCookies = (): void => {
  for (const name of Object.values(COOKIE_NAMES)) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
};

const settle = async (): Promise<void> => {
  TestBed.tick();
  await new Promise((resolve) => setTimeout(resolve, 10));
  TestBed.tick();
};

describe('BrowserAccountService', () => {
  const auth = {
    status: signal<AuthStatus>('booting'),
    userId: signal<number | null>(null),
    sessionExpired: signal(false),
    refresh: vi.fn(async (): Promise<string | null> => null),
  };
  const consent = signal<ConsentStatus>('granted');
  const analytics = signal(true);
  let answers: LinkStatus[];
  const link = vi.fn(async (): Promise<LinkStatus | null> => {
    return answers.shift() ?? 'linked';
  });
  let other: BroadcastChannel;
  let heard: unknown[];

  const service = (): BrowserAccountService => TestBed.inject(BrowserAccountService);

  const signIn = (userId: number): void => {
    auth.userId.set(userId);
    auth.status.set('authenticated');
  };

  const signOut = (expired: boolean): void => {
    auth.sessionExpired.set(expired);
    auth.userId.set(null);
    auth.status.set('anonymous');
  };

  beforeEach(() => {
    clearCookies();
    TestBed.resetTestingModule();
    auth.status.set('booting');
    auth.userId.set(null);
    auth.sessionExpired.set(false);
    auth.refresh.mockClear();
    consent.set('granted');
    analytics.set(true);
    answers = [];
    link.mockClear();
    writeCookie(COOKIE_NAMES.visitor, 'visitor-a', 3600);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: auth },
        { provide: ConsentStore, useValue: { status: consent } },
        { provide: FeaturesService, useValue: { analytics } },
        { provide: AnalyticsApi, useValue: { link } },
      ],
    });
    heard = [];
    other = new BroadcastChannel(ANALYTICS_CHANNEL);
    other.onmessage = (event: MessageEvent): void => {
      heard.push(event.data);
    };
  });

  afterEach(() => {
    other.close();
    TestBed.resetTestingModule();
    clearCookies();
  });

  it('links the visitor once the account is known, and tells the other tabs', async () => {
    service();
    signIn(7);
    await settle();

    expect(link.mock.calls).toEqual([['visitor-a']]);
    expect(heard).toContainEqual({ type: 'account-changed', userId: 7 });
  });

  it('links nothing without consent or with analytics off', async () => {
    consent.set('denied');
    service();
    signIn(7);
    await settle();
    analytics.set(false);
    consent.set('granted');
    await settle();

    expect(link).not.toHaveBeenCalled();
  });

  it('starts a fresh visitor when the current one belongs to another account', async () => {
    answers = ['conflict', 'linked'];
    service();
    signIn(7);
    await settle();

    const fresh = readCookie(COOKIE_NAMES.visitor);
    expect(fresh).not.toBe('visitor-a');
    expect(link.mock.calls).toEqual([['visitor-a'], [fresh]]);
  });

  it('starts a fresh visitor when the current one was erased', async () => {
    answers = ['erased', 'linked'];
    service();
    signIn(7);
    await settle();

    expect(link).toHaveBeenCalledTimes(2);
    expect(readCookie(COOKIE_NAMES.visitor)).not.toBe('visitor-a');
  });

  it('gives the next person a new visitor after signing out here', async () => {
    service();
    signIn(7);
    await settle();

    signOut(false);
    await settle();

    expect(readCookie(COOKIE_NAMES.visitor)).not.toBe('visitor-a');
    expect(heard).toContainEqual({ type: 'account-changed', userId: null });
  });

  it('leaves the visitor alone when the session lapsed rather than ended here', async () => {
    service();
    signIn(7);
    await settle();

    signOut(true);
    await settle();

    expect(readCookie(COOKIE_NAMES.visitor)).toBe('visitor-a');
    expect(heard).not.toContainEqual({ type: 'account-changed', userId: null });
  });

  it('suspends a tab signed in as another account than the browser, and refreshes it', async () => {
    const tab = service();
    signIn(7);
    await settle();
    link.mockClear();

    other.postMessage({ type: 'account-changed', userId: 8 });
    await settle();

    expect(tab.suspended()).toBe(true);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(link).not.toHaveBeenCalled();
  });

  it('resumes under the browser visitor once its refresh clears it', async () => {
    const tab = service();
    signIn(7);
    await settle();
    other.postMessage({ type: 'account-changed', userId: 8 });
    await settle();

    signOut(true);
    await settle();

    expect(tab.suspended()).toBe(false);
    expect(readCookie(COOKIE_NAMES.visitor)).toBe('visitor-a');
  });

  it('never suspends an anonymous tab', async () => {
    const tab = service();
    auth.status.set('anonymous');
    await settle();

    other.postMessage({ type: 'account-changed', userId: 8 });
    await settle();

    expect(tab.suspended()).toBe(false);
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('starts fresh after an erase, links the new visitor and tells the other tabs', async () => {
    const tab = service();
    signIn(7);
    await settle();
    link.mockClear();

    await tab.afterErase();
    await settle();

    const fresh = readCookie(COOKIE_NAMES.visitor);
    expect(fresh).not.toBe('visitor-a');
    expect(link.mock.calls).toEqual([[fresh]]);
    expect(heard).toContainEqual({ type: 'erased' });
  });
});
