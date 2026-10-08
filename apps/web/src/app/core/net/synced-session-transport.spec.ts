import type { SessionRole } from '@naucto/engine';
import SimplePeer from 'simple-peer/simplepeer.min.js';
import { type Mock, type MockInstance, vi } from 'vitest';

import { SessionSignalingSocket } from './session-signaling-socket';
import type { SyncedSessionTransportOptions } from './synced-session-transport';
import { readRelayUsage, SyncedSessionTransport } from './synced-session-transport';

vi.mock('simple-peer/simplepeer.min.js', () => ({
  default: vi.fn().mockImplementation(function () {
    const handlers: Record<string, (arg?: unknown) => void> = {};
    return {
      on(event: string, cb: (arg?: unknown) => void): void {
        handlers[event] = cb;
      },
      signal: vi.fn(),
      send: vi.fn(),
      destroy: vi.fn(),
      fire(event: string, arg?: unknown): void {
        handlers[event]?.(arg);
      },
    };
  }),
}));

const PeerMock = SimplePeer as unknown as Mock;

// The Angular unit-test builder refuses `vi.mock` on a relative import, so the real signaling
// socket runs over a stubbed WebSocket and its `send` is spied on the prototype.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() {
    FakeWebSocket.instances.push(this);
  }

  send(): void {}

  close(): void {
    this.readyState = 3;
  }
}

interface FakeSignaling {
  opts: {
    onFrame: (frame: unknown) => void;
    onOpen: () => void;
  };
  send: MockInstance;
}

interface FakePeer {
  signal: Mock;
  send: Mock;
  fire: (event: string, arg?: unknown) => void;
}

const options = (role: SessionRole, selfUserId: number): SyncedSessionTransportOptions => ({
  role,
  selfUserId,
  signalingUrl: 'ws://signal',
  ticket: 'ticket',
  ticketIssuedAt: Date.now(),
  iceServers: [],
  refreshTicket: async () => null,
});

let signalingSend: MockInstance;

const signaling = (): FakeSignaling => {
  const socket = FakeWebSocket.instances[0]!;
  return {
    opts: {
      onFrame: (frame) => socket.onmessage?.({ data: JSON.stringify(frame) }),
      onOpen: () => socket.onopen?.(),
    },
    send: signalingSend,
  };
};
const peer = (index: number): FakePeer => PeerMock.mock.results[index]!.value as FakePeer;

describe('SyncedSessionTransport', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    signalingSend = vi
      .spyOn(SessionSignalingSocket.prototype, 'send')
      .mockImplementation(() => undefined);
    PeerMock.mockClear();
  });

  afterEach(() => {
    signalingSend.mockRestore();
    vi.unstubAllGlobals();
  });

  it('relays a slave request over the WS when no data channel is up', () => {
    const transport = new SyncedSessionTransport(options('slave', 2));

    transport.sendRequest({ move: 1 });

    expect(signaling().send).toHaveBeenCalledWith({ type: 'request', data: { move: 1 } });
    transport.destroy();
  });

  it('emits a relayed request to the host', () => {
    const transport = new SyncedSessionTransport(options('host', 1));
    const received: { from: number; data: unknown }[] = [];
    transport.on('request', (from, data) => received.push({ from, data }));

    signaling().opts.onFrame({ type: 'request', from: 2, data: { a: 1 } });

    expect(received).toEqual([{ from: 2, data: { a: 1 } }]);
    transport.destroy();
  });

  it('emits relayed state to a slave with no data channel', () => {
    const transport = new SyncedSessionTransport(options('slave', 2));
    const states: unknown[] = [];
    transport.on('state', (data) => states.push(data));

    signaling().opts.onFrame({ type: 'state', data: { hp: 5 } });

    expect(states).toEqual([{ hp: 5 }]);
    transport.destroy();
  });

  it('announces a joined peer immediately over the relay (no P2P wait)', () => {
    const transport = new SyncedSessionTransport(options('host', 1));
    const joined: number[] = [];
    transport.on('peerJoined', (id) => joined.push(id));

    signaling().opts.onFrame({ type: 'peer-joined', userId: 2 });

    // peerJoined fires synchronously — the host must be able to push its state
    // snapshot right away, before its own live patches reach the newcomer.
    expect(joined).toEqual([2]);

    transport.broadcastState({ x: 1 });
    expect(signaling().send).toHaveBeenCalledWith({ type: 'state', data: { x: 1 } });

    transport.destroy();
  });

  it('tells a peer joining again apart from a newcomer', () => {
    const transport = new SyncedSessionTransport(options('host', 1));
    const joined: number[] = [];
    const rejoined: number[] = [];
    transport.on('peerJoined', (id) => joined.push(id));
    transport.on('peerRejoined', (id) => rejoined.push(id));

    signaling().opts.onFrame({ type: 'peer-joined', userId: 2 });
    signaling().opts.onFrame({ type: 'peer-joined', userId: 2 });

    expect(joined).toEqual([2]);
    expect(rejoined).toEqual([2]);
    transport.destroy();
  });

  it('keeps the bytes a departed peer had moved in the totals', () => {
    const transport = new SyncedSessionTransport(options('host', 1));
    signaling().opts.onFrame({ type: 'peer-joined', userId: 2 });
    const usage = { relayed: true, bytesSent: 10, bytesReceived: 20 };
    const peers = (transport as unknown as { peers: Map<number, { usage: unknown }> }).peers;
    const joinedPeer = peers.get(2);
    if (joinedPeer) {
      joinedPeer.usage = usage;
    }

    signaling().opts.onFrame({ type: 'peer-left', userId: 2 });

    expect(transport.relayUsage()).toEqual([usage]);
    transport.destroy();
  });

  it('announces a peer it is signalling with, told about it or not', () => {
    const transport = new SyncedSessionTransport(options('host', 1));
    const joined: number[] = [];
    transport.on('peerJoined', (id) => joined.push(id));

    // A signal and nothing else, which is all a peer whose control frame went missing arrives with.
    signaling().opts.onFrame({ type: 'signal', from: 2, data: { sdp: 'x' } });

    expect(joined).toEqual([2]);
    expect(peer(0).signal).toHaveBeenCalledWith({ sdp: 'x' });

    // And only once, however many signals the handshake takes.
    signaling().opts.onFrame({ type: 'signal', from: 2, data: { sdp: 'y' } });
    expect(joined).toEqual([2]);

    transport.destroy();
  });

  it('serialises a broadcast once, however many channels it goes down', () => {
    const transport = new SyncedSessionTransport(options('host', 1));
    signaling().opts.onFrame({ type: 'peer-joined', userId: 2 });
    signaling().opts.onFrame({ type: 'peer-joined', userId: 3 });
    peer(0).fire('connect');
    peer(1).fire('connect');

    const wire = JSON.stringify({ type: 'state', data: { x: 1 } });
    const stringify = vi.spyOn(JSON, 'stringify');
    transport.broadcastState({ x: 1 });

    expect(peer(0).send).toHaveBeenCalledWith(wire);
    expect(peer(1).send).toHaveBeenCalledWith(wire);
    expect(stringify).toHaveBeenCalledTimes(1);
    expect(signaling().send).not.toHaveBeenCalled();

    stringify.mockRestore();
    transport.destroy();
  });

  it("sends over the data channel once a slave's P2P connects", () => {
    const transport = new SyncedSessionTransport(options('slave', 2));

    signaling().opts.onOpen();
    peer(0).fire('connect');

    transport.sendRequest({ move: 2 });

    expect(peer(0).send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'request', data: { move: 2 } }),
    );
    expect(signaling().send).not.toHaveBeenCalled();
    transport.destroy();
  });
});

describe('readRelayUsage', () => {
  const pair = (extra: Record<string, unknown>): Record<string, unknown> => ({
    type: 'candidate-pair',
    localCandidateId: 'L',
    bytesSent: 1000,
    bytesReceived: 2000,
    ...extra,
  });
  const local = (candidateType: string, id = 'L'): Record<string, unknown> => ({
    type: 'local-candidate',
    id,
    candidateType,
  });

  it('reads the pair ICE settled on and leaves the others alone', () => {
    expect(
      readRelayUsage([
        pair({ localCandidateId: 'other', bytesSent: 99, bytesReceived: 99 }),
        pair({ selected: true }),
        local('host'),
      ]),
    ).toEqual({ relayed: false, bytesSent: 1000, bytesReceived: 2000 });
  });

  it('reads the pair the transport names over any other nominated one', () => {
    expect(
      readRelayUsage([
        { type: 'transport', selectedCandidatePairId: 'P2' },
        pair({ id: 'P2', nominated: true, bytesSent: 5 }),
        pair({ id: 'P3', nominated: true, bytesSent: 7 }),
        local('host'),
      ])?.bytesSent,
    ).toBe(5);
  });

  it('calls a session relayed when our own end holds the allocation', () => {
    expect(readRelayUsage([pair({ nominated: true }), local('relay')])?.relayed).toBe(true);
  });

  it('does not call a session relayed for the other end alone', () => {
    const reports = [
      pair({ selected: true, remoteCandidateId: 'R' }),
      local('host'),
      { type: 'remote-candidate', id: 'R', candidateType: 'relay' },
    ];
    expect(readRelayUsage(reports)?.relayed).toBe(false);
  });

  it('answers nothing while ICE has not settled', () => {
    expect(readRelayUsage([pair({}), local('relay')])).toBeNull();
  });
});
