import { computed, effect, inject, untracked } from '@angular/core';
import {
  notificationsControllerGetWebRtcOffer,
  notificationsControllerMarkAsRead,
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

import { AuthStore } from '../auth/auth.store';
import { AppConfigService } from '../config/app-config';

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING';
  read: boolean;
  createdAt: string;
}

type SocketState = 'closed' | 'connecting' | 'open';

interface NotificationsState {
  items: NotificationItem[];
  socket: SocketState;
  panelOpen: boolean;
}

const MAX_ITEMS = 50;
const PING_MS = 25_000;

type Inbound =
  | { type: 'notifications:init'; payload?: NotificationItem[]; data?: NotificationItem[] }
  | { type: 'notification'; payload?: NotificationItem; data?: NotificationItem }
  | { type: 'pong' }
  | { type: string; payload?: unknown };

/**
 * Live notifications over the backend's user socket (also the carrier for
 * presence events later). Connects when authenticated, reconnects with backoff.
 */
export const NotificationsStore = signalStore(
  { providedIn: 'root' },
  withState<NotificationsState>({ items: [], socket: 'closed', panelOpen: false }),
  withProps(() => ({
    ws: null as WebSocket | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    ping: null as ReturnType<typeof setInterval> | null,
    backoff: 1000,
    auth: inject(AuthStore),
    config: inject(AppConfigService),
    listeners: new Set<(msg: Inbound) => void>(),
  })),
  withComputed((s) => ({
    unread: computed(() => s.items().filter((n) => !n.read).length),
  })),
  withMethods((store) => {
    const close = (): void => {
      if (store.timer) clearTimeout(store.timer);
      if (store.ping) clearInterval(store.ping);
      store.timer = null;
      store.ping = null;
      store.ws?.close();
      store.ws = null;
      patchState(store, { socket: 'closed' });
    };

    const connect = async (): Promise<void> => {
      if (store.ws || !store.auth.isAuthenticated()) return;
      patchState(store, { socket: 'connecting' });
      try {
        const offer = await notificationsControllerGetWebRtcOffer();
        const raw = offer.data as
          { data?: { signaling?: string[] }; signaling?: string[] } | undefined;
        const url = raw?.data?.signaling?.[0] ?? raw?.signaling?.[0];
        const token = store.auth.accessToken();
        if (!url || !token) throw new Error('no signaling endpoint');
        const ws = new WebSocket(store.config.reachable(url));
        store.ws = ws;
        ws.onopen = () => {
          store.backoff = 1000;
          patchState(store, { socket: 'open' });
          ws.send(JSON.stringify({ type: 'auth', token: store.auth.accessToken() }));
          store.ping = setInterval(() => {
            ws.send(JSON.stringify({ type: 'ping' }));
          }, PING_MS);
        };
        ws.onmessage = (e: MessageEvent<string>) => {
          let msg: Inbound;
          try {
            msg = JSON.parse(e.data) as Inbound;
          } catch {
            return;
          }
          if (msg.type === 'notifications:init') {
            const list =
              (msg as { payload?: NotificationItem[]; data?: NotificationItem[] }).payload ??
              (msg as { data?: NotificationItem[] }).data ??
              [];
            patchState(store, { items: list.slice(0, MAX_ITEMS) });
          } else if (msg.type === 'notification') {
            const n =
              (msg as { payload?: NotificationItem; data?: NotificationItem }).payload ??
              (msg as { data?: NotificationItem }).data;
            if (n)
              patchState(store, {
                items: [n, ...store.items().filter((x) => x.id !== n.id)].slice(0, MAX_ITEMS),
              });
          }
          store.listeners.forEach((l) => {
            l(msg);
          });
        };
        ws.onclose = () => {
          store.ws = null;
          if (store.ping) clearInterval(store.ping);
          store.ping = null;
          patchState(store, { socket: 'closed' });
          if (store.auth.isAuthenticated()) {
            store.timer = setTimeout(() => {
              void connect();
            }, store.backoff);
            store.backoff = Math.min(store.backoff * 2, 30_000);
          }
        };
      } catch {
        patchState(store, { socket: 'closed' });
        store.timer = setTimeout(() => {
          void connect();
        }, store.backoff);
        store.backoff = Math.min(store.backoff * 2, 30_000);
      }
    };

    return {
      connect,
      close,
      /** Send a frame to the user socket; dropped when it is not open. */
      /**
       * Client messages are flat: the server reads `auth`'s token and `presence:set`'s fields off
       * the top level and closes the socket on anything it cannot validate. Wrapping them in a
       * `payload` — which is what the *server*'s messages look like — killed the connection.
       */
      send(msg: { type: string } & Record<string, unknown>): boolean {
        if (store.ws?.readyState !== WebSocket.OPEN) return false;
        store.ws.send(JSON.stringify(msg));
        return true;
      },
      onMessage(l: (msg: Inbound) => void): () => void {
        store.listeners.add(l);
        return () => store.listeners.delete(l);
      },
      togglePanel(open?: boolean): void {
        patchState(store, { panelOpen: open ?? !store.panelOpen() });
      },
      async markRead(id: number): Promise<void> {
        patchState(store, {
          items: store.items().map((n) => (n.id === id ? { ...n, read: true } : n)),
        });
        await notificationsControllerMarkAsRead({ path: { id: String(id) } });
      },
      async markAllRead(): Promise<void> {
        const unread = store.items().filter((n) => !n.read);
        patchState(store, { items: store.items().map((n) => ({ ...n, read: true })) });
        await Promise.allSettled(
          unread.map((n) => notificationsControllerMarkAsRead({ path: { id: String(n.id) } })),
        );
      },
    };
  }),
  withHooks({
    onInit(store) {
      effect(() => {
        const authed = store.auth.isAuthenticated();
        untracked(() => {
          if (authed) void store.connect();
          else {
            store.close();
            patchState(store, { items: [] });
          }
        });
      });
    },
  }),
);
