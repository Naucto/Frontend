import { computed, effect, inject, untracked } from '@angular/core';
import {
  type NotificationClientMessage,
  type NotificationPayloadDto,
  notificationsControllerGetWebRtcOffer,
  notificationsControllerMarkAllAsRead,
  notificationsControllerMarkAsRead,
  type NotificationServerMessage,
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
import { QueryClient } from '@tanstack/angular-query-experimental';

import { qk } from '../../shared/queries/query-keys';
import { AuthStore } from '../auth/auth.store';
import { AppConfigService } from '../config/app-config';

interface NotificationsState {
  items: NotificationPayloadDto[];
}

const MAX_ITEMS = 50;
const PING_MS = 25_000;
/** The first retry after a lost socket; each failure doubles it, up to the cap. */
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

/**
 * Live notifications over the backend's user socket, which presence rides too. Connects when
 * authenticated, reconnects with backoff.
 */
export const NotificationsStore = signalStore(
  { providedIn: 'root' },
  withState<NotificationsState>({ items: [] }),
  withProps(() => ({
    auth: inject(AuthStore),
    config: inject(AppConfigService),
    queries: inject(QueryClient),
  })),
  withComputed((state) => ({
    unread: computed(() => state.items().filter((notification) => !notification.read).length),
  })),
  withMethods((store) => {
    // Bookkeeping for this instance only: a prop written through the store would land on the copy
    // the factory was handed, and every reader outside would keep the value it started with.
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let backoff = BACKOFF_MIN_MS;
    let connecting = false;
    const listeners = new Set<(msg: NotificationServerMessage) => void>();

    const close = (): void => {
      if (timer) {
        clearTimeout(timer);
      }
      if (ping) {
        clearInterval(ping);
      }
      timer = null;
      ping = null;
      ws?.close();
      ws = null;
    };

    const handle = (msg: NotificationServerMessage): void => {
      switch (msg.type) {
        case 'notifications:init':
          patchState(store, { items: msg.payload.slice(0, MAX_ITEMS) });
          break;
        case 'notification': {
          const notification = msg.payload;
          patchState(store, {
            items: [
              notification,
              ...store.items().filter((item) => item.id !== notification.id),
            ].slice(0, MAX_ITEMS),
          });
          // A friend request answered on the other side changes the list, and this socket is
          // the only thing that hears it.
          if (notification.kind === 'FRIEND_REQUEST' || notification.kind === 'FRIEND_ACCEPTED') {
            void store.queries.invalidateQueries({ queryKey: qk.friends() });
          }
          break;
        }
        case 'pong':
        case 'presence:snapshot':
        case 'presence:changed':
        case 'presence:offline':
          break;
        default:
          msg satisfies never;
      }
      listeners.forEach((listener) => {
        listener(msg);
      });
    };

    const scheduleReconnect = (): void => {
      timer = setTimeout(() => {
        void connect();
      }, backoff);
      backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
    };

    const connect = async (): Promise<void> => {
      // The offer is a round trip, so a socket alone cannot tell a connect in flight from one done.
      if (connecting || ws || !store.auth.isAuthenticated()) {
        return;
      }
      connecting = true;
      try {
        const offer = await notificationsControllerGetWebRtcOffer();
        const raw = offer.data as
          { data?: { signaling?: string[] }; signaling?: string[] } | undefined;
        const url = raw?.data?.signaling?.[0] ?? raw?.signaling?.[0];
        const token = store.auth.accessToken();
        if (!url || !token) {
          throw new Error('no signaling endpoint');
        }
        ws = new WebSocket(store.config.reachable(url));
        ws.onopen = () => {
          backoff = BACKOFF_MIN_MS;
          ws?.send(
            JSON.stringify({
              type: 'auth',
              token: store.auth.accessToken() ?? token,
            } satisfies NotificationClientMessage),
          );
          ping = setInterval(() => {
            ws?.send(JSON.stringify({ type: 'ping' } satisfies NotificationClientMessage));
          }, PING_MS);
        };
        ws.onmessage = (event: MessageEvent<string>) => {
          let msg: NotificationServerMessage;
          try {
            msg = JSON.parse(event.data) as NotificationServerMessage;
          } catch {
            return;
          }
          handle(msg);
        };
        ws.onclose = () => {
          ws = null;
          if (ping) {
            clearInterval(ping);
          }
          ping = null;
          if (store.auth.isAuthenticated()) {
            scheduleReconnect();
          }
        };
      } catch {
        scheduleReconnect();
      } finally {
        connecting = false;
      }
    };

    return {
      connect,
      close,
      /**
       * Sends a frame to the user socket; false when it is not open. Client frames are flat: the
       * server reads their fields off the top level and closes the socket on anything it cannot
       * validate.
       */
      send(msg: NotificationClientMessage): boolean {
        if (ws?.readyState !== WebSocket.OPEN) {
          return false;
        }
        ws.send(JSON.stringify(msg));
        return true;
      },
      onMessage(listener: (msg: NotificationServerMessage) => void): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      async markRead(id: string): Promise<void> {
        patchState(store, {
          items: store
            .items()
            .map((notification) =>
              notification.id === id ? { ...notification, read: true } : notification,
            ),
        });
        await notificationsControllerMarkAsRead({ path: { id } });
      },
      async markAllRead(): Promise<void> {
        patchState(store, {
          items: store.items().map((notification) => ({ ...notification, read: true })),
        });
        await notificationsControllerMarkAllAsRead();
      },
    };
  }),
  withHooks({
    onInit(store) {
      effect(() => {
        const authed = store.auth.isAuthenticated();
        untracked(() => {
          if (authed) {
            void store.connect();
          } else {
            store.close();
            patchState(store, { items: [] });
          }
        });
      });
    },
  }),
);
