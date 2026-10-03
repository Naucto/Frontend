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
 * What the notification is about, which decides where clicking it leads. Mirrors the server's enum.
 */
export type NotificationKind =
  | 'GENERIC'
  | 'FRIEND_REQUEST'
  | 'FRIEND_ACCEPTED'
  | 'FEATURED'
  | 'COLLABORATOR_ADDED'
  | 'COLLABORATOR_REMOVED';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING';
  kind: NotificationKind;
  data: Record<string, unknown> | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsState {
  items: NotificationItem[];
}

const MAX_ITEMS = 50;
const PING_MS = 25_000;

interface Inbound {
  type: string;
  payload?: unknown;
  data?: unknown;
}

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
  withComputed((s) => ({
    unread: computed(() => s.items().filter((n) => !n.read).length),
  })),
  withMethods((store) => {
    // Bookkeeping for this instance only: a prop written through the store would land on the copy
    // the factory was handed, and every reader outside would keep the value it started with.
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let backoff = 1000;
    let connecting = false;
    const listeners = new Set<(msg: Inbound) => void>();

    const close = (): void => {
      if (timer) clearTimeout(timer);
      if (ping) clearInterval(ping);
      timer = null;
      ping = null;
      ws?.close();
      ws = null;
    };

    const connect = async (): Promise<void> => {
      // The offer is a round trip, so a socket alone cannot tell a connect in flight from one done.
      if (connecting || ws || !store.auth.isAuthenticated()) return;
      connecting = true;
      try {
        const offer = await notificationsControllerGetWebRtcOffer();
        const raw = offer.data as
          { data?: { signaling?: string[] }; signaling?: string[] } | undefined;
        const url = raw?.data?.signaling?.[0] ?? raw?.signaling?.[0];
        const token = store.auth.accessToken();
        if (!url || !token) throw new Error('no signaling endpoint');
        ws = new WebSocket(store.config.reachable(url));
        ws.onopen = () => {
          backoff = 1000;
          ws?.send(JSON.stringify({ type: 'auth', token: store.auth.accessToken() }));
          ping = setInterval(() => {
            ws?.send(JSON.stringify({ type: 'ping' }));
          }, PING_MS);
        };
        ws.onmessage = (e: MessageEvent<string>) => {
          let msg: Inbound;
          try {
            msg = JSON.parse(e.data) as Inbound;
          } catch {
            return;
          }
          const body = msg.payload ?? msg.data;
          if (msg.type === 'notifications:init' && Array.isArray(body)) {
            patchState(store, { items: (body as NotificationItem[]).slice(0, MAX_ITEMS) });
          } else if (msg.type === 'notification' && body) {
            const n = body as NotificationItem;
            patchState(store, {
              items: [n, ...store.items().filter((x) => x.id !== n.id)].slice(0, MAX_ITEMS),
            });
            // A friend request answered on the other side changes the list, and this socket is
            // the only thing that hears it.
            if (n.kind === 'FRIEND_REQUEST' || n.kind === 'FRIEND_ACCEPTED')
              void store.queries.invalidateQueries({ queryKey: ['friends'] });
          }
          listeners.forEach((l) => {
            l(msg);
          });
        };
        ws.onclose = () => {
          ws = null;
          if (ping) clearInterval(ping);
          ping = null;
          if (store.auth.isAuthenticated()) {
            timer = setTimeout(() => {
              void connect();
            }, backoff);
            backoff = Math.min(backoff * 2, 30_000);
          }
        };
      } catch {
        timer = setTimeout(() => {
          void connect();
        }, backoff);
        backoff = Math.min(backoff * 2, 30_000);
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
      send(msg: { type: string } & Record<string, unknown>): boolean {
        if (ws?.readyState !== WebSocket.OPEN) return false;
        ws.send(JSON.stringify(msg));
        return true;
      },
      onMessage(l: (msg: Inbound) => void): () => void {
        listeners.add(l);
        return () => listeners.delete(l);
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
