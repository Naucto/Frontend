import { computed, inject } from '@angular/core';
import {
  type NotificationServerMessage,
  type PresenceDto,
  type PresenceSetMessage,
} from '@naucto/api-client';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';

import { NotificationsStore } from '../notifications/notifications.store';
import { presenceApi } from './presence.api';

interface PresenceState {
  /** Latest presence per user id. Absent means offline. */
  byUser: Record<number, PresenceDto>;
  seeded: boolean;
}

/** What this client tells the server it is doing. */
type PresenceUpdate = Omit<PresenceSetMessage, 'type'>;

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
    notifications: inject(NotificationsStore),
  })),
  withComputed((store) => ({
    /** Everyone with something to show, newest activity first. */
    active: computed(() =>
      Object.values(store.byUser())
        .filter((presence) => presence.kind !== 'IDLE')
        .sort((a, b) => b.since.localeCompare(a.since)),
    ),
  })),
  withMethods((store) => {
    /** Re-sent whenever the socket reconnects, so a reconnect does not lose our state. */
    let lastUpdate: PresenceUpdate = { kind: 'IDLE' };

    const merge = (list: readonly PresenceDto[]): void => {
      const byUser = { ...store.byUser() };
      for (const presence of list) {
        byUser[presence.userId] = presence;
      }
      patchState(store, { byUser, seeded: true });
    };

    return {
      of(userId: number): PresenceDto | null {
        return store.byUser()[userId] ?? null;
      },

      /** Seed from REST; the socket takes over as soon as its snapshot lands. */
      async load(): Promise<void> {
        if (store.seeded()) {
          return;
        }
        try {
          merge(await presenceApi.friends());
        } catch {
          /* offline or not signed in: the socket will seed us later */
        }
      },

      /** Tell the server what we are doing. Also replayed on reconnect. */
      announce(update: PresenceUpdate): void {
        lastUpdate = update;
        store.notifications.send({ type: 'presence:set', ...update });
      },

      handle(msg: NotificationServerMessage): void {
        switch (msg.type) {
          case 'presence:snapshot':
            patchState(store, {
              byUser: Object.fromEntries(
                msg.payload.map((presence) => [presence.userId, presence]),
              ),
              seeded: true,
            });
            break;
          case 'presence:changed':
            merge([msg.payload]);
            break;
          case 'presence:offline': {
            const { userId } = msg.payload;
            const byUser = Object.fromEntries(
              Object.entries(store.byUser()).filter(([id]) => Number(id) !== userId),
            );
            patchState(store, { byUser });
            break;
          }
          case 'notifications:init':
            // The socket has just (re)authenticated: restate what we are doing.
            store.notifications.send({ type: 'presence:set', ...lastUpdate });
            break;
          case 'notification':
          case 'pong':
            break;
          default:
            msg satisfies never;
        }
      },
    };
  }),
  withHooks((store) => {
    let unsubscribe: (() => void) | null = null;
    return {
      onInit() {
        unsubscribe = store.notifications.onMessage((msg) => {
          store.handle(msg);
        });
        void store.load();
      },
      onDestroy() {
        unsubscribe?.();
      },
    };
  }),
);
