import { InboundFrame, OutboundFrame } from "./frames";

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

  refreshTicket: () => Promise<RefreshedTicket | null>;
  onFrame: (frame: InboundFrame) => void;
  onOpen: () => void;
  onClosed: () => void;
}

export class SessionSignalingSocket implements Destroyable {
  private _ws?: WebSocket;
  private _ticket: string;
  private _ticketIssuedAt: number;
  private _backoff = RECONNECT_MIN_MS;
  private _reconnectTimer?: ReturnType<typeof setTimeout>;
  private _destroyed = false;
  private readonly _outbox: string[] = [];

  constructor(private readonly _opts: SignalingSocketOptions) {
    this._ticket = _opts.ticket;
    this._ticketIssuedAt = _opts.ticketIssuedAt;
    this._connect();
  }

  destroy(): void {
    this._destroyed = true;

    if (this._reconnectTimer)
      clearTimeout(this._reconnectTimer);

    this._teardownSocket();
  }

  send(frame: OutboundFrame): void {
    const serialized = JSON.stringify(frame);

    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(serialized);
      return;
    }

    this._outbox.push(serialized);
  }

  private _connect(): void {
    const ws = new WebSocket(`${this._opts.url}?ticket=${encodeURIComponent(this._ticket)}`);
    this._ws = ws;

    ws.onopen = (): void => {
      this._backoff = RECONNECT_MIN_MS;
      this._flush();
      this._opts.onOpen();
    };

    ws.onmessage = (event: MessageEvent): void => {
      let frame: InboundFrame;

      try {
        frame = JSON.parse(event.data as string) as InboundFrame;
      } catch {
        return;
      }

      // The host's departure is terminal — there is no host promotion, so stop
      // reconnecting and let the owner tear the session down.
      if (frame.type === "session-ended") {
        this._opts.onFrame(frame);
        this.destroy();
        this._opts.onClosed();
        return;
      }

      this._opts.onFrame(frame);
    };

    ws.onclose = (): void => {
      if (this._destroyed)
        return;

      void this._scheduleReconnect();
    };
  }

  private async _scheduleReconnect(): Promise<void> {
    if (Date.now() - this._ticketIssuedAt >= TICKET_REFRESH_MS) {
      const refreshed = await this._opts.refreshTicket();

      if (this._destroyed)
        return;

      if (!refreshed) {
        this._opts.onClosed();
        return;
      }

      this._ticket = refreshed.ticket;
      this._ticketIssuedAt = refreshed.issuedAt;
    }

    const delay = this._backoff;
    this._backoff = Math.min(this._backoff * 2, RECONNECT_MAX_MS);
    this._reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  private _flush(): void {
    if (!this._ws)
      return;

    for (const message of this._outbox)
      this._ws.send(message);

    this._outbox.length = 0;
  }

  private _teardownSocket(): void {
    if (!this._ws)
      return;

    this._ws.onopen = null;
    this._ws.onmessage = null;
    this._ws.onclose = null;
    this._ws.onerror = null;

    try {
      this._ws.close();
    } catch {
      // A socket that never opened throws on close; nothing to clean up.
    }

    this._ws = undefined;
  }
}
