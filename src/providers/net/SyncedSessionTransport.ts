import {
  SessionRole,
  SessionTransport,
  SessionTransportEvents,
  UserId,
} from "@engine/net/SessionTransport";

import { InboundFrame } from "./frames";
import { RefreshedTicket, SessionSignalingSocket } from "./SessionSignalingSocket";

import SimplePeer from "simple-peer";

const FALLBACK_MS = 8_000;

export interface SyncedSessionTransportOptions {
  role: SessionRole;
  selfUserId: UserId;
  signalingUrl: string;
  ticket: string;
  ticketIssuedAt: number;
  iceServers: RTCIceServer[];

  refreshTicket: () => Promise<RefreshedTicket | null>;
}

type AnyListener = (...args: unknown[]) => void;

interface Peer {
  conn: SimplePeer.Instance;
  channelOpen: boolean;
  announced: boolean;
  fallbackTimer?: ReturnType<typeof setTimeout>;
}

// Star-to-host P2P with relay fallback. The same `{type,data}` frames ride a
// direct data channel when one is up and the WS relay otherwise; a slave whose
// channel is open ignores relayed state/response so mixed-mode sessions never
// double-apply.
export class SyncedSessionTransport implements SessionTransport {
  public readonly role: SessionRole;
  public readonly selfUserId: UserId;

  private readonly _signaling: SessionSignalingSocket;
  private readonly _iceServers: RTCIceServer[];
  private readonly _listeners = new Map<keyof SessionTransportEvents, Set<AnyListener>>();

  // host: one peer per slave userId. slave: a single entry keyed by the host.
  private readonly _peers = new Map<UserId, Peer>();
  private _destroyed = false;

  constructor(opts: SyncedSessionTransportOptions) {
    this.role = opts.role;
    this.selfUserId = opts.selfUserId;
    this._iceServers = opts.iceServers;

    this._signaling = new SessionSignalingSocket({
      url: opts.signalingUrl,
      ticket: opts.ticket,
      ticketIssuedAt: opts.ticketIssuedAt,
      refreshTicket: opts.refreshTicket,
      onFrame: frame => this._onFrame(frame),
      onOpen: () => this._onSocketOpen(),
      onClosed: () => this._emit("closed"),
    });
  }

  destroy(): void {
    this._destroyed = true;

    for (const peer of this._peers.values())
      this._teardownPeer(peer);

    this._peers.clear();
    this._signaling.destroy();
  }

  broadcastState(data: unknown): void {
    let anyRelay = false;

    for (const peer of this._peers.values()) {
      if (peer.channelOpen) {
        this._safeSend(peer, { type: "state", data });
      } else {
        anyRelay = true;
      }
    }

    // Relay state is broadcast to every slave; channel-connected ones drop it.
    if (anyRelay || this._peers.size === 0) {
      this._signaling.send({ type: "state", data });
    }
  }

  respondTo(userId: UserId, data: unknown): void {
    const peer = this._peers.get(userId);

    if (peer?.channelOpen) {
      this._safeSend(peer, { type: "response", data });
      return;
    }

    this._signaling.send({ type: "response", to: userId, data });
  }

  sendRequest(data: unknown): void {
    const host = this._hostPeer();

    if (host?.channelOpen) {
      this._safeSend(host, { type: "request", data });
      return;
    }

    this._signaling.send({ type: "request", data });
  }

  on<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void {
    const set = this._listeners.get(event) ?? new Set<AnyListener>();
    set.add(listener as AnyListener);
    this._listeners.set(event, set);
  }

  off<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void {
    this._listeners.get(event)?.delete(listener as AnyListener);
  }

  private _emit<E extends keyof SessionTransportEvents>(
    event: E,
    ...args: Parameters<SessionTransportEvents[E]>
  ): void {
    if (this._destroyed)
      return;

    this._listeners.get(event)?.forEach((listener) => listener(...args));
  }

  private _onSocketOpen(): void {
    this._emit("connected");

    // The slave drives the handshake (it knows it just joined); the host waits
    // for each slave's offer before answering.
    if (this.role === "slave" && !this._peers.has(this.selfUserId))
      this._createPeer(this.selfUserId, true);
  }

  private _onFrame(frame: InboundFrame): void {
    switch (frame.type) {
      case "state":
        if (!this._hostPeer()?.channelOpen)
          this._emit("state", frame.data);
        break;

      case "response":
        if (!this._hostPeer()?.channelOpen)
          this._emit("response", frame.data);
        break;

      case "request":
        this._emit("request", frame.from, frame.data);
        break;

      case "signal":
        if (frame.from !== undefined)
          this._onSignal(frame.from, frame.data);
        else
          this._onSignal(this.selfUserId, frame.data);
        break;

      case "peer-joined":
        this._onPeerJoined(frame.userId);
        break;

      case "peer-left":
        this._onPeerLeft(frame.userId);
        break;

      case "session-ended":
        this._emit("ended");
        break;
    }
  }

  private _onPeerJoined(userId: UserId): void {
    const peer = this._ensurePeer(userId);

    // P2P may never come up; promise reachability over the relay after a grace
    // period so the host can start talking to the slave either way.
    peer.fallbackTimer = setTimeout(() => this._announce(userId), FALLBACK_MS);
  }

  private _onPeerLeft(userId: UserId): void {
    const peer = this._peers.get(userId);

    if (!peer)
      return;

    this._teardownPeer(peer);
    this._peers.delete(userId);
    this._emit("peerLeft", userId);
  }

  private _onSignal(userId: UserId, data: unknown): void {
    const peer = this._ensurePeer(userId);

    try {
      peer.conn.signal(data as SimplePeer.SignalData);
    } catch {
      this._announce(userId);
    }
  }

  private _ensurePeer(userId: UserId): Peer {
    const existing = this._peers.get(userId);

    if (existing)
      return existing;

    return this._createPeer(userId, false);
  }

  private _createPeer(userId: UserId, initiator: boolean): Peer {
    const conn = new SimplePeer({
      initiator,
      trickle: true,
      config: { iceServers: this._iceServers },
    });

    const peer: Peer = { conn, channelOpen: false, announced: false };
    this._peers.set(userId, peer);

    conn.on("signal", (data) => {
      // A slave only ever signals the host, so it omits `to`; the host targets
      // the specific slave.
      if (this.role === "host")
        this._signaling.send({ type: "signal", to: userId, data });
      else
        this._signaling.send({ type: "signal", data });
    });

    conn.on("connect", () => {
      peer.channelOpen = true;
      this._announce(userId);
    });

    conn.on("data", (raw) => this._onChannelData(userId, raw));

    conn.on("error", () => this._announce(userId));
    conn.on("close", () => {
      peer.channelOpen = false;
    });

    return peer;
  }

  private _onChannelData(userId: UserId, raw: SimplePeer.SimplePeerData): void {
    let frame: { type: string; data?: unknown };

    try {
      frame = JSON.parse(raw.toString()) as { type: string; data?: unknown };
    } catch {
      return;
    }

    if (frame.type === "request")
      this._emit("request", userId, frame.data);
    else if (frame.type === "state")
      this._emit("state", frame.data);
    else if (frame.type === "response")
      this._emit("response", frame.data);
  }

  private _announce(userId: UserId): void {
    const peer = this._peers.get(userId);

    if (!peer || peer.announced)
      return;

    if (peer.fallbackTimer)
      clearTimeout(peer.fallbackTimer);

    peer.announced = true;

    // The slave's own "peer" is the host; only a host announces joined slaves.
    if (this.role === "host")
      this._emit("peerJoined", userId);
  }

  private _safeSend(peer: Peer, frame: { type: string; data?: unknown }): void {
    try {
      peer.conn.send(JSON.stringify(frame));
    } catch {
      peer.channelOpen = false;
    }
  }

  private _hostPeer(): Peer | undefined {
    if (this.role !== "slave")
      return undefined;

    return this._peers.get(this.selfUserId);
  }

  private _teardownPeer(peer: Peer): void {
    if (peer.fallbackTimer)
      clearTimeout(peer.fallbackTimer);

    try {
      peer.conn.destroy();
    } catch {
      // Already torn down.
    }
  }
}
