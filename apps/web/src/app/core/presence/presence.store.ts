import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';

import { AuthStore } from '../auth/auth.store';
import { NotificationsStore } from '../notifications/notifications.store';
import { presenceApi } from './presence.api';
import { type PresenceDto, type PresenceUpdate } from './presence.types';

interface PresenceState {
  /** Latest presence per user id. Absent means offline. */
  byUser: Record<number, PresenceDto>;
  seeded: boolean;
}

const isPresence = (v: unknown): v is PresenceDto =>
  typeof v === 'object' && v !== null && typeof (v as PresenceDto).userId === 'number';

/**
 * Who is online and what they are doing, live over the notifications socket.
 *
 * The backend pushes `presence:snapshot` on auth and `presence:changed` / `presence:offline`
 * afterwards, so nothing here polls. REST is only used to seed when the socket is not up yet.
 * This store also announces what *we* are doing, which is what makes us appear as playing to
 * our friends.
 */
export const PresenceStore = signalStore(
  { providedIn: 'root' },
  withState<PresenceState>({ byUser: {}, seeded: false }),
  withProps(() => ({
    auth: inject(AuthStore),
    notifications: inject(NotificationsStore),
    unsubscribe: null as (() => void) | null,
    /** Re-sent whenever the socket reconnects, so a reconnect does not lose our state. */
    lastUpdate: { kind: 'IDLE' },
  })),
  withComputed((store) => ({
    /** Everyone with something to show, newest activity first. */
    active: computed(() =>
      Object.values(store.byUser())
        .filter((p) => p.kind !== 'IDLE')
        .sort((a, b) => b.since.localeCompare(a.since)),
    ),
  })),
  withMethods((store) => {
    const merge = (list: readonly PresenceDto[]): void => {
      const byUser = { ...store.byUser() };
      for (const p of list) byUser[p.userId] = p;
      patchState(store, { byUser, seeded: true });
    };

    return {
      of(userId: number): PresenceDto | null {
        return store.byUser()[userId] ?? null;
      },

      /** Seed from REST; the socket takes over as soon as its snapshot lands. */
      async load(): Promise<void> {
        if (store.seeded()) return;
        try {
          merge(await presenceApi.friends());
        } catch {
          /* offline or not signed in: the socket will seed us later */
        }
      },

      /** Tell the server what we are doing. Also replayed on reconnect. */
      announce(update: PresenceUpdate): void {
        store.lastUpdate = update;
        store.notifications.send({ type: 'presence:set', ...update });
      },

      handle(msg: { type: string; payload?: unknown; data?: unknown }): void {
        const body = msg.payload ?? msg.data;
        if (msg.type === 'presence:snapshot' && Array.isArray(body)) {
          merge(body.filter(isPresence));
        } else if (msg.type === 'presence:changed' && isPresence(body)) {
          merge([body]);
        } else if (msg.type === 'presence:offline') {
          const userId = (body as { userId?: number } | undefined)?.userId;
          if (typeof userId === 'number') {
            const byUser = Object.fromEntries(
              Object.entries(store.byUser()).filter(([id]) => Number(id) !== userId),
            );
            patchState(store, { byUser });
          }
        } else if (msg.type === 'notifications:init') {
          // The socket has just (re)authenticated: restate what we are doing.
          store.notifications.send({ type: 'presence:set', ...store.lastUpdate });
        }
      },
    };
  }),
  withHooks({
    onInit(store) {
      store.unsubscribe = store.notifications.onMessage((msg) => {
        store.handle(msg);
      });
      void store.load();
    },
    onDestroy(store) {
      store.unsubscribe?.();
    },
  }),
);
