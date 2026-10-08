import { DestroyRef, inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';

import { COOKIE_NAMES, readCookie, writeCookie } from '../storage/cookies';
import { clearIdentity, ensureVisitorId } from './visitor';

export type ConsentStatus = 'unknown' | 'granted' | 'denied';

/** A choice is kept six months, then asked again. */
export const CONSENT_MAX_AGE_MS = 182 * 24 * 60 * 60 * 1000;

/** Tabs of the app tell each other about consent and identity changes on this channel. */
export const ANALYTICS_CHANNEL = 'naucto-analytics';

interface StoredConsent {
  v: 1;
  analytics: boolean;
  at: number;
}

interface ConsentState {
  status: ConsentStatus;
  decidedAt: number | null;
}

/** The choice on the consent cookie, or none when it is absent, unreadable or past its age. */
export function readConsent(now = Date.now()): ConsentState {
  const raw = readCookie(COOKIE_NAMES.consent);
  if (!raw) {
    return { status: 'unknown', decidedAt: null };
  }
  try {
    const stored = JSON.parse(raw) as Partial<StoredConsent>;
    if (stored.v !== 1 || typeof stored.analytics !== 'boolean' || typeof stored.at !== 'number') {
      return { status: 'unknown', decidedAt: null };
    }
    if (now - stored.at >= CONSENT_MAX_AGE_MS) {
      return { status: 'unknown', decidedAt: null };
    }
    return { status: stored.analytics ? 'granted' : 'denied', decidedAt: stored.at };
  } catch {
    return { status: 'unknown', decidedAt: null };
  }
}

/**
 * Whether this browser agreed to usage analytics. The visitor and session cookies exist only while
 * it has: they are dropped whenever the choice is not a current yes, whichever tab notices first.
 */
export const ConsentStore = signalStore(
  { providedIn: 'root' },
  withState<ConsentState>(() => readConsent()),
  withMethods((store) => {
    let channel: BroadcastChannel | null = null;
    let expiry: ReturnType<typeof setTimeout> | null = null;

    const apply = (state: ConsentState): void => {
      if (state.status !== 'granted') {
        clearIdentity();
      }
      patchState(store, state);
      scheduleExpiry();
    };

    const scheduleExpiry = (): void => {
      if (expiry) {
        clearTimeout(expiry);
        expiry = null;
      }
      const decidedAt = store.decidedAt();
      if (decidedAt === null) {
        return;
      }
      // Capped: a timer longer than ~24.8 days fires at once.
      const wait = Math.min(decidedAt + CONSENT_MAX_AGE_MS - Date.now(), 2 ** 31 - 1);
      expiry = setTimeout(
        () => {
          apply(readConsent());
        },
        Math.max(0, wait),
      );
    };

    const decide = (analytics: boolean): void => {
      const at = Date.now();
      const stored: StoredConsent = { v: 1, analytics, at };
      writeCookie(COOKIE_NAMES.consent, JSON.stringify(stored), CONSENT_MAX_AGE_MS / 1000);
      if (analytics) {
        ensureVisitorId();
      }
      apply({ status: analytics ? 'granted' : 'denied', decidedAt: at });
      channel?.postMessage({ type: 'consent-changed' });
    };

    return {
      grant(): void {
        decide(true);
      },
      deny(): void {
        decide(false);
      },
      /** Reads the cookie again, after another tab decided or the choice lapsed. */
      sync(): void {
        apply(readConsent());
      },
      connect(destroyRef: DestroyRef): void {
        apply(readConsent());
        if (typeof BroadcastChannel !== 'undefined') {
          channel = new BroadcastChannel(ANALYTICS_CHANNEL);
          channel.onmessage = (event: MessageEvent<{ type?: string }>): void => {
            if (event.data.type === 'consent-changed') {
              apply(readConsent());
            }
          };
        }
        const onVisible = (): void => {
          if (document.visibilityState === 'visible') {
            apply(readConsent());
          }
        };
        document.addEventListener('visibilitychange', onVisible);
        destroyRef.onDestroy(() => {
          document.removeEventListener('visibilitychange', onVisible);
          channel?.close();
          channel = null;
          if (expiry) {
            clearTimeout(expiry);
          }
        });
      },
    };
  }),
  withHooks({
    onInit(store) {
      store.connect(inject(DestroyRef));
    },
  }),
);
