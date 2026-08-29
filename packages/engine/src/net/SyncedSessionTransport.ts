import SimplePeer from 'simple-peer/simplepeer.min.js';

import type { InboundFrame } from './frames';
import type { RefreshedTicket } from './SessionSignalingSocket';
import { SessionSignalingSocket } from './SessionSignalingSocket';
import type {
  SessionRole,
  SessionTransport,
  SessionTransportEvents,
  UserId,
} from './SessionTransport';

// The min build's default export is the constructor only; pull the type members
// from the @types/simple-peer namespace.
type PeerInstance = import('simple-peer').Instance;
type PeerSignalData = import('simple-peer').SignalData;
type PeerData = import('simple-peer').SimplePeerData;

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
  conn: PeerInstance;
  channelOpen: boolean;
  announced: boolean;
  /** Last measured round-trip time in ms, null until the first pong lands. */
  rttMs: number | null;
}

/** How often each open channel is pinged. */
const PING_INTERVAL_MS = 2000;

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
  private _pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: SyncedSessionTransportOptions) {
    this.role = opts.role;
    this.selfUserId = opts.selfUserId;
    this._iceServers = opts.iceServers;

    this._signaling = new SessionSignalingSocket({
      url: opts.signalingUrl,
      ticket: opts.ticket,
      ticketIssuedAt: opts.ticketIssuedAt,
      refreshTicket: opts.refreshTicket,
      onFrame: (frame) => {
        this._onFrame(frame);
      },
      onOpen: () => {
        this._onSocketOpen();
      },
      onClosed: () => {
        this._emit('closed');
      },
    });
  }

  destroy(): void {
    this._destroyed = true;
    if (this._pingTimer !== null) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }

    for (const peer of this._peers.values()) this._teardownPeer(peer);

    this._peers.clear();
    this._signaling.destroy();
  }

  /** Test-rig impairment: added latency (ms) and drop probability (0..1) on outgoing game frames. */
  private _impairment = { latencyMs: 0, loss: 0 };

  setImpairment(i: { latencyMs: number; loss: number }): void {
    this._impairment = {
      latencyMs: Math.max(0, i.latencyMs),
      loss: Math.min(1, Math.max(0, i.loss)),
    };
  }

  private _impaired(send: () => void): void {
    const { latencyMs, loss } = this._impairment;
    if (loss > 0 && Math.random() < loss) return;
    if (latencyMs > 0) setTimeout(send, latencyMs);
    else send();
  }

  broadcastState(data: unknown): void {
    this._impaired(() => {
      let anyRelay = false;

      for (const peer of this._peers.values()) {
        if (peer.channelOpen) {
          this._safeSend(peer, { type: 'state', data });
        } else {
          anyRelay = true;
        }
      }

      // Relay state is broadcast to every slave; channel-connected ones drop it.
      if (anyRelay || this._peers.size === 0) {
        this._signaling.send({ type: 'state', data });
      }
    });
  }

  respondTo(userId: UserId, data: unknown): void {
    this._impaired(() => {
      const peer = this._peers.get(userId);

      if (peer?.channelOpen) {
        this._safeSend(peer, { type: 'response', data });
        return;
      }

      this._signaling.send({ type: 'response', to: userId, data });
    });
  }

  sendRequest(data: unknown): void {
    this._impaired(() => {
      const host = this._hostPeer();

      if (host?.channelOpen) {
        this._safeSend(host, { type: 'request', data });
        return;
      }

      this._signaling.send({ type: 'request', data });
    });
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
    if (this._destroyed) return;

    this._listeners.get(event)?.forEach((listener) => {
      listener(...args);
    });
  }

  private _onSocketOpen(): void {
    this._emit('connected');

    // The slave drives the handshake (it knows it just joined); the host waits
    // for each slave's offer before answering.
    if (this.role === 'slave' && !this._peers.has(this.selfUserId))
      this._createPeer(this.selfUserId, true);
  }

  private _onFrame(frame: InboundFrame): void {
    switch (frame.type) {
      case 'state':
        if (!this._hostPeer()?.channelOpen) this._emit('state', frame.data);
        break;

      case 'response':
        if (!this._hostPeer()?.channelOpen) this._emit('response', frame.data);
        break;

      case 'request':
        this._emit('request', frame.from, frame.data);
        break;

      case 'signal':
        if (frame.from !== undefined) this._onSignal(frame.from, frame.data);
        else this._onSignal(this.selfUserId, frame.data);
        break;

      case 'peer-joined':
        this._onPeerJoined(frame.userId);
        break;

      case 'peer-left':
        this._onPeerLeft(frame.userId);
        break;

      case 'session-ended':
        this._emit('ended');
        break;
    }
  }

  private _onPeerJoined(userId: UserId): void {
    this._ensurePeer(userId);

    // Announce over the relay immediately rather than waiting for P2P (or a
    // fallback timer): the relay is already reachable, so the host can push its
    // state snapshot to the newcomer right away, and P2P upgrades transparently
    // once it connects. Deferring this let the host's live per-frame patches
    // (e.g. its own paddle) reach the slave before the baseline snapshot,
    // briefly exposing half-populated sub-tables to the game.
    this._announce(userId);
  }

  private _onPeerLeft(userId: UserId): void {
    const peer = this._peers.get(userId);

    if (!peer) return;

    this._teardownPeer(peer);
    this._peers.delete(userId);
    this._emit('peerLeft', userId);
  }

  private _onSignal(userId: UserId, data: unknown): void {
    const peer = this._ensurePeer(userId);

    try {
      peer.conn.signal(data as PeerSignalData);
    } catch {
      this._announce(userId);
    }
  }

  private _ensurePeer(userId: UserId): Peer {
    const existing = this._peers.get(userId);

    if (existing) return existing;

    return this._createPeer(userId, false);
  }

  private _createPeer(userId: UserId, initiator: boolean): Peer {
    const conn = new SimplePeer({
      initiator,
      trickle: true,
      config: { iceServers: this._iceServers },
    });

    const peer: Peer = { conn, channelOpen: false, announced: false, rttMs: null };
    this._peers.set(userId, peer);

    conn.on('signal', (data) => {
      // A slave only ever signals the host, so it omits `to`; the host targets
      // the specific slave.
      if (this.role === 'host') this._signaling.send({ type: 'signal', to: userId, data });
      else this._signaling.send({ type: 'signal', data });
    });

    conn.on('connect', () => {
      peer.channelOpen = true;
      this._announce(userId);
      this._startPinging();
    });

    conn.on('data', (raw) => {
      this._onChannelData(userId, raw);
    });

    conn.on('error', () => {
      this._announce(userId);
    });
    conn.on('close', () => {
      peer.channelOpen = false;
      peer.rttMs = null;
    });

    return peer;
  }

  private _onChannelData(userId: UserId, raw: PeerData): void {
    let frame: { type: string; data?: unknown };

    try {
      frame = JSON.parse(
        typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array),
      ) as { type: string; data?: unknown };
    } catch {
      return;
    }

    if (frame.type === 'request') this._emit('request', userId, frame.data);
    else if (frame.type === 'state') this._emit('state', frame.data);
    else if (frame.type === 'response') this._emit('response', frame.data);
    else if (frame.type === 'ping') {
      const peer = this._peers.get(userId);
      if (peer) this._safeSend(peer, { type: 'pong', data: frame.data });
    } else if (frame.type === 'pong') {
      const peer = this._peers.get(userId);
      const sentAt = typeof frame.data === 'number' ? frame.data : null;
      if (peer && sentAt !== null) peer.rttMs = Math.max(0, Date.now() - sentAt);
    }
  }

  /** Round-trip time to a peer, measured over the data channel. */
  pingTo(userId: UserId): number | null {
    return this._peers.get(userId)?.rttMs ?? null;
  }

  private _startPinging(): void {
    if (this._pingTimer !== null) return;
    this._pingTimer = setInterval(() => {
      const now = Date.now();
      for (const peer of this._peers.values()) {
        if (peer.channelOpen) this._safeSend(peer, { type: 'ping', data: now });
      }
    }, PING_INTERVAL_MS);
    // Never hold a Node process open for a heartbeat (tests, headless runs).
    (this._pingTimer as { unref?: () => void }).unref?.();
  }

  private _announce(userId: UserId): void {
    const peer = this._peers.get(userId);

    if (!peer || peer.announced) return;

    peer.announced = true;

    // The slave's own "peer" is the host; only a host announces joined slaves.
    if (this.role === 'host') this._emit('peerJoined', userId);
  }

  private _safeSend(peer: Peer, frame: { type: string; data?: unknown }): void {
    try {
      peer.conn.send(JSON.stringify(frame));
    } catch {
      peer.channelOpen = false;
    }
  }

  private _hostPeer(): Peer | undefined {
    if (this.role !== 'slave') return undefined;

    return this._peers.get(this.selfUserId);
  }

  private _teardownPeer(peer: Peer): void {
    try {
      peer.conn.destroy();
    } catch {
      // Already torn down.
    }
  }
}
