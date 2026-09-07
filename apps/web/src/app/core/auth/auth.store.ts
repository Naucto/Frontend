import { computed, inject } from '@angular/core';
import {
  authControllerChangePassword,
  authControllerLogin,
  authControllerLogout,
  authControllerRefresh,
  authControllerRegister,
  type CreateUserDto,
  userControllerGetProfile,
  type UserProfileResponseDto,
} from '@naucto/api-client';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';

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
  withProps(() => ({
    inFlight: null as Promise<string | null> | null,
    active: false,
    keepAlive: null as ReturnType<typeof setInterval> | null,
  })),
  withComputed((s) => ({
    isAuthenticated: computed(() => s.status() === 'authenticated'),
    ready: computed(() => s.status() !== 'booting'),
    userId: computed(() => s.user()?.id ?? null),
    displayName: computed(() => s.user()?.nickname ?? s.user()?.username ?? ''),
  })),
  withMethods((store) => {
    const applyToken = async (token: string): Promise<void> => {
      patchState(store, { accessToken: token });
      const profile = unwrap(
        await userControllerGetProfile({ headers: { Authorization: `Bearer ${token}` } }),
      );
      patchState(store, { user: profile, status: 'authenticated', sessionExpired: false });
      startKeepAlive();
    };

    const clear = (expired = false): void => {
      stopKeepAlive();
      patchState(store, {
        accessToken: null,
        user: null,
        status: 'anonymous',
        sessionExpired: expired,
      });
    };

    /** Single-flight refresh using the cookie; resolves the new token or null. */
    const refresh = (): Promise<string | null> => {
      store.inFlight ??= (async () => {
        try {
          const res = await authControllerRefresh({ credentials: 'include' });
          const token = res.data ? unwrap(res).access_token : undefined;
          if (!token) {
            if (store.status() === 'authenticated') clear(true);
            return null;
          }
          patchState(store, { accessToken: token });
          return token;
        } catch {
          if (store.status() === 'authenticated') clear(true);
          return null;
        } finally {
          store.inFlight = null;
        }
      })();
      return store.inFlight;
    };

    const markActive = (): void => {
      store.active = true;
    };

    const startKeepAlive = (): void => {
      if (store.keepAlive || typeof window === 'undefined') return;
      for (const ev of ['mousemove', 'keydown', 'click', 'touchstart'])
        window.addEventListener(ev, markActive, { passive: true });
      store.keepAlive = setInterval(() => {
        if (!store.active) return;
        store.active = false;
        void refresh();
      }, KEEP_ALIVE_MS);
    };

    const stopKeepAlive = (): void => {
      if (!store.keepAlive) return;
      clearInterval(store.keepAlive);
      store.keepAlive = null;
      for (const ev of ['mousemove', 'keydown', 'click', 'touchstart'])
        window.removeEventListener(ev, markActive);
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
          await authControllerLogout({ credentials: 'include' });
        } finally {
          clear();
        }
      },
      async changePassword(
        currentPassword: string | undefined,
        newPassword: string,
      ): Promise<void> {
        unwrap(await authControllerChangePassword({ body: { currentPassword, newPassword } }));
      },
      async refreshProfile(): Promise<void> {
        const profile = unwrap(await userControllerGetProfile());
        patchState(store, { user: profile });
      },
      dismissSessionExpired(): void {
        patchState(store, { sessionExpired: false });
      },
      /** Marks the session as expired (used when a socket reports an invalid token). */
      expire(): void {
        clear(true);
      },
    };
  }),
);

export type AuthStoreType = InstanceType<typeof AuthStore>;
export const injectAuth = (): AuthStoreType => inject(AuthStore);
