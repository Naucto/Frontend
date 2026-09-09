import { computed, effect, inject, untracked } from '@angular/core';
import {
  notificationsControllerGetWebRtcOffer,
  notificationsControllerMarkAllAsRead,
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
import { QueryClient } from '@tanstack/angular-query-experimental';

import { AuthStore } from '../auth/auth.store';
import { AppConfigService } from '../config/app-config';

/**
 * What the notification is about, which is what decides where clicking it goes.
 *
 * The server has sent this and its payload since notifications shipped; the client declared
 * neither, so every one of them was a line of text with nowhere to lead. FEATURED is in the
 * server's enum and nothing sends it yet.
 */
export type NotificationKind =
  'GENERIC' | 'FRIEND_REQUEST' | 'FRIEND_ACCEPTED' | 'FEATURED' | 'COLLABORATOR_ADDED';

export interface NotificationItem {
  /** A string on the wire, and it was declared a number here: the two never met, so nothing broke. */
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING';
  kind: NotificationKind;
  data: Record<string, unknown> | null;
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
    queries: inject(QueryClient),
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
            if (n) {
              patchState(store, {
                items: [n, ...store.items().filter((x) => x.id !== n.id)].slice(0, MAX_ITEMS),
              });
              // Someone else accepting your request changes your friend list, and until now
              // nothing here knew it had: the list was refetched when *you* mutated it, so a
              // request answered on the other side only appeared after a reload. That is the
              // "friends need to refresh to invite" everyone hit.
              if (n.kind === 'FRIEND_REQUEST' || n.kind === 'FRIEND_ACCEPTED')
                void store.queries.invalidateQueries({ queryKey: ['friends'] });
            }
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
      async markRead(id: string): Promise<void> {
        patchState(store, {
          items: store.items().map((n) => (n.id === id ? { ...n, read: true } : n)),
        });
        await notificationsControllerMarkAsRead({ path: { id } });
      },
      async markAllRead(): Promise<void> {
        patchState(store, { items: store.items().map((n) => ({ ...n, read: true })) });
        await notificationsControllerMarkAllAsRead();
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
