import { computed, inject } from '@angular/core';
import {
  authControllerLogin,
  authControllerLogout,
  authControllerRefresh,
  authControllerRegister,
  type CreateUserDto,
  userControllerGetProfile,
  type UserProfileResponseDto,
} from '@naucto/api-client';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { unwrap } from '../api/api-errors';

export type AuthStatus = 'booting' | 'anonymous' | 'authenticated';

interface AuthState {
  /** Kept in memory only — never persisted. */
  accessToken: string | null;
  user: UserProfileResponseDto | null;
  status: AuthStatus;
  sessionExpired: boolean;
}

const KEEP_ALIVE_MS = 10 * 60 * 1000;

/**
 * Authentication: bearer token in memory, refreshed from the httpOnly cookie at
 * boot and whenever a request hits 401. Active users are kept signed in by a
 * periodic refresh; idle ones lapse when the cookie expires.
 */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState<AuthState>({ accessToken: null, user: null, status: 'booting', sessionExpired: false }),
  withComputed((state) => ({
    isAuthenticated: computed(() => state.status() === 'authenticated'),
    userId: computed(() => state.user()?.id ?? null),
    displayName: computed(() => state.user()?.nickname ?? state.user()?.username ?? ''),
  })),
  withMethods((store) => {
    const queries = inject(QueryClient);
    // Bookkeeping for this instance only: a prop written through the store would land on the copy
    // the factory was handed, and every reader outside would keep the value it started with.
    let inFlight: Promise<string | null> | null = null;
    let active = false;
    let keepAlive: ReturnType<typeof setInterval> | null = null;

    const applyToken = async (token: string): Promise<void> => {
      try {
        const profile = unwrap(
          await userControllerGetProfile({ headers: { Authorization: `Bearer ${token}` } }),
        );
        patchState(store, {
          accessToken: token,
          user: profile,
          status: 'authenticated',
          sessionExpired: false,
        });
      } catch (error: unknown) {
        // No caller may be left holding a live token behind a signed-out store.
        clear();
        throw error;
      }
      startKeepAlive();
    };

    const clear = (expired = false): void => {
      stopKeepAlive();
      // Cached server state is keyed by resource, not by account.
      queries.clear();
      patchState(store, {
        accessToken: null,
        user: null,
        status: 'anonymous',
        sessionExpired: expired,
      });
    };

    /** Single-flight refresh using the cookie; resolves the new token or null. */
    const refresh = (): Promise<string | null> => {
      inFlight ??= (async () => {
        try {
          const res = await authControllerRefresh({ credentials: 'include' });
          const token = res.data ? unwrap(res).access_token : undefined;
          if (!token) {
            if (res.response?.status === 401 && store.status() === 'authenticated') {
              clear(true);
            }
            return null;
          }
          patchState(store, { accessToken: token });
          // The refresh cookie belongs to the origin, not to a tab: one that was signed into
          // elsewhere must not keep acting as the account it still shows.
          if (store.status() === 'authenticated') {
            const me = unwrap(
              await userControllerGetProfile({ headers: { Authorization: `Bearer ${token}` } }),
            );
            if (me.id !== store.user()?.id) {
              clear(true);
              return null;
            }
            patchState(store, { user: me });
          }
          return token;
        } catch {
          return null;
        } finally {
          inFlight = null;
        }
      })();
      return inFlight;
    };

    const markActive = (): void => {
      active = true;
    };

    const startKeepAlive = (): void => {
      if (keepAlive || typeof window === 'undefined') {
        return;
      }
      for (const ev of ['mousemove', 'keydown', 'click', 'touchstart']) {
        window.addEventListener(ev, markActive, { passive: true });
      }
      keepAlive = setInterval(() => {
        if (!active) {
          return;
        }
        active = false;
        void refresh();
      }, KEEP_ALIVE_MS);
    };

    const stopKeepAlive = (): void => {
      if (!keepAlive) {
        return;
      }
      clearInterval(keepAlive);
      keepAlive = null;
      for (const ev of ['mousemove', 'keydown', 'click', 'touchstart']) {
        window.removeEventListener(ev, markActive);
      }
    };

    return {
      refresh,
      /** Called once at startup: silent refresh from the cookie, then profile. */
      async bootstrap(): Promise<void> {
        const token = await refresh();
        if (!token) {
          patchState(store, { status: 'anonymous' });
          return;
        }
        try {
          await applyToken(token);
        } catch {
          clear();
        }
      },
      async loginWithPassword(email: string, password: string): Promise<void> {
        const res = unwrap(
          await authControllerLogin({ body: { email, password }, credentials: 'include' }),
        );
        await applyToken(res.access_token);
      },
      async register(dto: CreateUserDto): Promise<void> {
        const res = unwrap(await authControllerRegister({ body: dto, credentials: 'include' }));
        await applyToken(res.access_token);
      },
      /** Finishes an OAuth flow that already produced an access token. */
      completeOAuth(token: string): Promise<void> {
        return applyToken(token);
      },
      async logout(): Promise<void> {
        try {
          const res = await authControllerLogout({ credentials: 'include' });
          // Only the server can revoke the refresh cookie, and it does so behind a live bearer.
          if (res.response?.status === 401) {
            const token = (await authControllerRefresh({ credentials: 'include' })).data
              ?.access_token;
            if (token) {
              await authControllerLogout({
                credentials: 'include',
                headers: { Authorization: `Bearer ${token}` },
              });
            }
          }
        } finally {
          clear();
        }
      },
      async refreshProfile(): Promise<void> {
        const profile = unwrap(await userControllerGetProfile());
        patchState(store, { user: profile });
      },
      dismissSessionExpired(): void {
        patchState(store, { sessionExpired: false });
      },
    };
  }),
);
