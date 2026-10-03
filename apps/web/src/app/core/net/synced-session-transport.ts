import type { GameTableServerMessage } from '@naucto/api-client';
import type {
  RelayUsage,
  SessionRole,
  SessionTransport,
  SessionTransportEvents,
  UserId,
} from '@naucto/engine';
// The min build's default export is the constructor only; pull the type members
// from the @types/simple-peer namespace.
import type {
  Instance as PeerInstance,
  SignalData as PeerSignalData,
  SimplePeerData as PeerData,
} from 'simple-peer';
import SimplePeer from 'simple-peer/simplepeer.min.js';

import type { RefreshedTicket } from './session-signaling-socket';
import { SessionSignalingSocket } from './session-signaling-socket';

export interface SyncedSessionTransportOptions {
  role: SessionRole;
  selfUserId: UserId;
  signalingUrl: string;
  ticket: string;
  ticketIssuedAt: number;
  iceServers: RTCIceServer[];
  /**
   * Gather relay candidates only, to measure what a relayed session costs; spends real relay
   * allowance.
   */
  relayOnly?: boolean;

  refreshTicket: (current: string) => Promise<RefreshedTicket | null>;
}

type AnyListener = (...args: unknown[]) => void;

interface Peer {
  conn: PeerInstance;
  channelOpen: boolean;
  announced: boolean;
  /** Last measured round-trip time in ms, null until the first pong lands. */
  rttMs: number | null;
  usage: RelayUsage | null;
}

/** How often each open channel is pinged. */
const PING_INTERVAL_MS = 2000;

/**
 * `getStats` is real on the peer and absent from its typings, so the shape it answers with is
 * declared here rather than assumed.
 */
interface StatsCapable {
  getStats(cb: (err: Error | null, reports: Record<string, unknown>[]) => void): void;
}

function str(report: Record<string, unknown>, key: string): string {
  const value = report[key];
  return typeof value === 'string' ? value : '';
}

function num(report: Record<string, unknown>, key: string): number {
  const value = report[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * The chosen pair's cost, or null while ICE has not settled on one.
 *
 * Each report type is matched under two spellings: browsers named these without the hyphen before
 * the standard settled, and the library passes back whatever it was handed.
 */
export function readRelayUsage(reports: Record<string, unknown>[]): RelayUsage | null {
  const locals = new Map<string, Record<string, unknown>>();
  const pairs = new Map<string, Record<string, unknown>>();
  let named = '';
  let selected: Record<string, unknown> | null = null;
  let nominated: Record<string, unknown> | null = null;

  for (const report of reports) {
    const type = str(report, 'type');
    switch (type) {
      case 'local-candidate':
      case 'localcandidate':
        locals.set(str(report, 'id'), report);
        break;
      case 'transport':
        named = str(report, 'selectedCandidatePairId') || named;
        break;
      case 'candidate-pair':
      case 'candidatepair':
        pairs.set(str(report, 'id'), report);
        if (report.selected === true) {
          selected = report;
        } else if (report.nominated === true) {
          nominated = report;
        }
        break;
    }
  }
  // Chromium never sets `selected` and may leave several pairs nominated; its transport report
  // names the one in use.
  const chosen = (named ? pairs.get(named) : undefined) ?? selected ?? nominated;
  if (!chosen) {
    return null;
  }

  const local = locals.get(str(chosen, 'localCandidateId'));
  return {
    relayed: local !== undefined && str(local, 'candidateType') === 'relay',
    bytesSent: num(chosen, 'bytesSent'),
    bytesReceived: num(chosen, 'bytesReceived'),
  };
}

// Star-to-host P2P with relay fallback. The same `{type,data}` frames ride a
// direct data channel when one is up and the WS relay otherwise; a slave whose
// channel is open ignores relayed state/response so mixed-mode sessions never
// double-apply.
export class SyncedSessionTransport implements SessionTransport {
  public readonly role: SessionRole;
  public readonly selfUserId: UserId;

  private readonly signaling: SessionSignalingSocket;
  private readonly iceServers: RTCIceServer[];
  private readonly relayOnly: boolean;
  private readonly listeners = new Map<keyof SessionTransportEvents, Set<AnyListener>>();

  // host: one peer per slave userId. slave: a single entry for the host, keyed by selfUserId.
  private readonly peers = new Map<UserId, Peer>();
  private readonly departedUsage: RelayUsage[] = [];
  private destroyed = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: SyncedSessionTransportOptions) {
    this.role = opts.role;
    this.selfUserId = opts.selfUserId;
    this.iceServers = opts.iceServers;
    this.relayOnly = opts.relayOnly ?? false;

    this.signaling = new SessionSignalingSocket({
      url: opts.signalingUrl,
      ticket: opts.ticket,
      ticketIssuedAt: opts.ticketIssuedAt,
      refreshTicket: opts.refreshTicket,
      onFrame: (frame) => {
        this.onFrame(frame);
      },
      onOpen: () => {
        this.onSocketOpen();
      },
      onClosed: () => {
        this.emit('closed');
      },
    });
  }

  destroy(): void {
    this.destroyed = true;
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    for (const peer of this.peers.values()) {
      this.teardownPeer(peer);
    }

    this.peers.clear();
    this.signaling.destroy();
  }

  /** Test-rig impairment: added latency (ms) and drop probability (0..1) on outgoing game frames. */
  private impairment = { latencyMs: 0, loss: 0 };

  setImpairment(impairment: { latencyMs: number; loss: number }): void {
    this.impairment = {
      latencyMs: Math.max(0, impairment.latencyMs),
      loss: Math.min(1, Math.max(0, impairment.loss)),
    };
  }

  private impaired(send: () => void): void {
    const { latencyMs, loss } = this.impairment;
    if (loss > 0 && Math.random() < loss) {
      return;
    }
    if (latencyMs > 0) {
      setTimeout(send, latencyMs);
    } else {
      send();
    }
  }

  broadcastState(data: unknown): void {
    this.impaired(() => {
      let anyRelay = false;
      // Serialised once for every channel: this runs every frame on the host.
      let wire: string | null = null;

      for (const peer of this.peers.values()) {
        if (peer.channelOpen) {
          wire ??= JSON.stringify({ type: 'state', data });
          this.safeSend(peer, wire);
        } else {
          anyRelay = true;
        }
      }

      // Relay state is broadcast to every slave; channel-connected ones drop it.
      if (anyRelay || this.peers.size === 0) {
        this.signaling.send({ type: 'state', data });
      }
    });
  }

  respondTo(userId: UserId, data: unknown): void {
    this.impaired(() => {
      const peer = this.peers.get(userId);

      if (peer?.channelOpen) {
        this.safeSend(peer, JSON.stringify({ type: 'response', data }));
        return;
      }

      this.signaling.send({ type: 'response', to: userId, data });
    });
  }

  sendRequest(data: unknown): void {
    this.impaired(() => {
      const host = this.hostPeer();

      if (host?.channelOpen) {
        this.safeSend(host, JSON.stringify({ type: 'request', data }));
        return;
      }

      this.signaling.send({ type: 'request', data });
    });
  }

  on<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void {
    const set = this.listeners.get(event) ?? new Set<AnyListener>();
    set.add(listener as AnyListener);
    this.listeners.set(event, set);
  }

  off<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void {
    this.listeners.get(event)?.delete(listener as AnyListener);
  }

  private emit<E extends keyof SessionTransportEvents>(
    event: E,
    ...args: Parameters<SessionTransportEvents[E]>
  ): void {
    if (this.destroyed) {
      return;
    }

    this.listeners.get(event)?.forEach((listener) => {
      listener(...args);
    });
  }

  private onSocketOpen(): void {
    this.emit('connected');

    // The slave drives the handshake (it knows it just joined); the host waits
    // for each slave's offer before answering.
    if (this.role === 'slave' && !this.peers.has(this.selfUserId)) {
      this.createPeer(this.selfUserId, true);
    }
  }

  private onFrame(frame: GameTableServerMessage): void {
    switch (frame.type) {
      case 'state':
        if (!this.hostPeer()?.channelOpen) {
          this.emit('state', frame.data);
        }
        break;

      case 'response':
        if (!this.hostPeer()?.channelOpen) {
          this.emit('response', frame.data);
        }
        break;

      case 'request':
        this.emit('request', frame.from, frame.data);
        break;

      case 'signal':
        if (frame.from !== undefined) {
          this.onSignal(frame.from, frame.data);
        } else {
          this.onSignal(this.selfUserId, frame.data);
        }
        break;

      case 'peer-joined':
        this.onPeerJoined(frame.userId);
        break;

      case 'peer-left':
        this.onPeerLeft(frame.userId);
        break;

      case 'session-ended':
        this.emit('ended');
        break;
    }
  }

  private onPeerJoined(userId: UserId): void {
    const known = this.peers.get(userId)?.announced === true;
    this.ensurePeer(userId);

    if (known) {
      if (this.role === 'host') {
        this.emit('peerRejoined', userId);
      }
      return;
    }

    // Announced now, over the relay, so the snapshot reaches the newcomer before any live patch.
    this.announce(userId);
  }

  private onPeerLeft(userId: UserId): void {
    const peer = this.peers.get(userId);

    if (!peer) {
      return;
    }

    if (peer.usage) {
      this.departedUsage.push(peer.usage);
    }
    this.teardownPeer(peer);
    this.peers.delete(userId);
    this.emit('peerLeft', userId);
  }

  private onSignal(userId: UserId, data: unknown): void {
    const peer = this.ensurePeer(userId);

    // A signal proves the peer is present even when its peer-joined frame was lost to a reconnect.
    this.announce(userId);

    try {
      peer.conn.signal(data as PeerSignalData);
    } catch {
      /* A peer that cannot take this signal has still been announced, and stays announced. */
    }
  }

  private ensurePeer(userId: UserId): Peer {
    const existing = this.peers.get(userId);

    if (existing) {
      return existing;
    }

    return this.createPeer(userId, false);
  }

  private createPeer(userId: UserId, initiator: boolean): Peer {
    const conn = new SimplePeer({
      initiator,
      trickle: true,
      config: {
        iceServers: this.iceServers,
        ...(this.relayOnly ? { iceTransportPolicy: 'relay' as const } : {}),
      },
    });

    const peer: Peer = { conn, channelOpen: false, announced: false, rttMs: null, usage: null };
    this.peers.set(userId, peer);

    conn.on('signal', (data) => {
      // A slave only ever signals the host, so it omits `to`; the host targets
      // the specific slave.
      if (this.role === 'host') {
        this.signaling.send({ type: 'signal', to: userId, data });
      } else {
        this.signaling.send({ type: 'signal', data });
      }
    });

    conn.on('connect', () => {
      peer.channelOpen = true;
      this.announce(userId);
      this.startPinging();
    });

    conn.on('data', (raw: PeerData) => {
      this.onChannelData(userId, raw);
    });

    conn.on('error', () => {
      this.announce(userId);
    });
    conn.on('close', () => {
      peer.channelOpen = false;
      peer.rttMs = null;
    });

    return peer;
  }

  private onChannelData(userId: UserId, raw: PeerData): void {
    let frame: { type: string; data?: unknown };

    try {
      frame = JSON.parse(
        typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array),
      ) as { type: string; data?: unknown };
    } catch {
      return;
    }

    switch (frame.type) {
      case 'request':
        this.emit('request', userId, frame.data);
        break;
      case 'state':
        this.emit('state', frame.data);
        break;
      case 'response':
        this.emit('response', frame.data);
        break;
      case 'ping': {
        const peer = this.peers.get(userId);
        if (peer) {
          this.safeSend(peer, JSON.stringify({ type: 'pong', data: frame.data }));
        }
        break;
      }
      case 'pong': {
        const peer = this.peers.get(userId);
        const sentAt = typeof frame.data === 'number' ? frame.data : null;
        if (peer && sentAt !== null) {
          peer.rttMs = Math.max(0, Date.now() - sentAt);
        }
        break;
      }
    }
  }

  /** Round-trip time to a peer, measured over the data channel. */
  pingTo(userId: UserId): number | null {
    return this.peers.get(userId)?.rttMs ?? null;
  }

  relayUsage(): RelayUsage[] {
    const out: RelayUsage[] = [...this.departedUsage];
    for (const peer of this.peers.values()) {
      if (peer.usage) {
        out.push(peer.usage);
      }
    }
    return out;
  }

  /**
   * Sampled on each heartbeat: stats answer asynchronously, after a synchronous `destroy` has closed
   * the connection.
   */
  private sampleUsage(peer: Peer): void {
    (peer.conn as unknown as StatsCapable).getStats((err, reports) => {
      if (err) {
        return;
      }
      const usage = readRelayUsage(reports);
      if (usage) {
        peer.usage = usage;
      }
    });
  }

  private startPinging(): void {
    if (this.pingTimer !== null) {
      return;
    }
    this.pingTimer = setInterval(() => {
      const now = Date.now();
      for (const peer of this.peers.values()) {
        if (!peer.channelOpen) {
          continue;
        }
        this.safeSend(peer, JSON.stringify({ type: 'ping', data: now }));
        this.sampleUsage(peer);
      }
    }, PING_INTERVAL_MS);
    // Never hold a Node process open for a heartbeat (tests, headless runs).
    (this.pingTimer as { unref?: () => void }).unref?.();
  }

  private announce(userId: UserId): void {
    const peer = this.peers.get(userId);

    if (!peer || peer.announced) {
      return;
    }

    peer.announced = true;

    // The slave's own "peer" is the host; only a host announces joined slaves.
    if (this.role === 'host') {
      this.emit('peerJoined', userId);
    }
  }

  private safeSend(peer: Peer, wire: string): void {
    try {
      peer.conn.send(wire);
    } catch {
      peer.channelOpen = false;
    }
  }

  private hostPeer(): Peer | undefined {
    if (this.role !== 'slave') {
      return undefined;
    }

    return this.peers.get(this.selfUserId);
  }

  private teardownPeer(peer: Peer): void {
    try {
      peer.conn.destroy();
    } catch {
      // Already torn down.
    }
  }
}
