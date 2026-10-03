import type { GameTableClientMessage, GameTableServerMessage } from '@naucto/api-client';
import type { Destroyable } from '@naucto/engine';

const TICKET_REFRESH_MS = 55_000;
const RECONNECT_MIN_MS = 250;
const RECONNECT_MAX_MS = 2_000;

export interface RefreshedTicket {
  ticket: string;
  issuedAt: number;
}

export interface SignalingSocketOptions {
  url: string;
  ticket: string;
  ticketIssuedAt: number;

  /**
   * Trade the ticket the socket holds for a fresh one. It is handed over because a ticket is
   * minted for a connection, not for an account: the server can only keep this client's identity
   * if it sees which ticket it is replacing.
   */
  refreshTicket: (current: string) => Promise<RefreshedTicket | null>;
  onFrame: (frame: GameTableServerMessage) => void;
  onOpen: () => void;
  onClosed: () => void;
}

export class SessionSignalingSocket implements Destroyable {
  private ws?: WebSocket;
  private ticket: string;
  private ticketIssuedAt: number;
  private backoff = RECONNECT_MIN_MS;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private destroyed = false;
  private readonly outbox: string[] = [];

  constructor(private readonly opts: SignalingSocketOptions) {
    this.ticket = opts.ticket;
    this.ticketIssuedAt = opts.ticketIssuedAt;
    this.connect();
  }

  destroy(): void {
    this.destroyed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.teardownSocket();
  }

  send(frame: GameTableClientMessage): void {
    const serialized = JSON.stringify(frame);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
      return;
    }

    this.outbox.push(serialized);
  }

  private connect(): void {
    const ws = new WebSocket(`${this.opts.url}?ticket=${encodeURIComponent(this.ticket)}`);
    this.ws = ws;

    ws.onopen = (): void => {
      this.backoff = RECONNECT_MIN_MS;
      this.flush();
      this.opts.onOpen();
    };

    ws.onmessage = (event: MessageEvent): void => {
      let frame: GameTableServerMessage;

      try {
        frame = JSON.parse(event.data as string) as GameTableServerMessage;
      } catch {
        return;
      }

      // The host's departure is terminal — there is no host promotion, so stop
      // reconnecting and let the owner tear the session down.
      if (frame.type === 'session-ended') {
        this.opts.onFrame(frame);
        this.destroy();
        this.opts.onClosed();
        return;
      }

      this.opts.onFrame(frame);
    };

    ws.onclose = (): void => {
      if (this.destroyed) {
        return;
      }

      void this.scheduleReconnect();
    };
  }

  private async scheduleReconnect(): Promise<void> {
    if (Date.now() - this.ticketIssuedAt >= TICKET_REFRESH_MS) {
      const refreshed = await this.opts.refreshTicket(this.ticket);

      if (this.destroyed) {
        return;
      }

      if (!refreshed) {
        this.opts.onClosed();
        return;
      }

      this.ticket = refreshed.ticket;
      this.ticketIssuedAt = refreshed.issuedAt;
    }

    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private flush(): void {
    if (!this.ws) {
      return;
    }

    for (const message of this.outbox) {
      this.ws.send(message);
    }

    this.outbox.length = 0;
  }

  private teardownSocket(): void {
    if (!this.ws) {
      return;
    }

    this.ws.onopen = null;
    this.ws.onmessage = null;
    this.ws.onclose = null;
    this.ws.onerror = null;

    try {
      this.ws.close();
    } catch {
      // A socket that never opened throws on close; nothing to clean up.
    }

    this.ws = undefined;
  }
}
