import SimplePeer from 'simple-peer/simplepeer.min.js';
import { type Mock, vi } from 'vitest';

import { SessionSignalingSocket } from './SessionSignalingSocket';
import type { SessionRole } from './SessionTransport';
import type { SyncedSessionTransportOptions } from './SyncedSessionTransport';
import { SyncedSessionTransport } from './SyncedSessionTransport';

vi.mock('./SessionSignalingSocket', () => ({
  SessionSignalingSocket: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    opts: unknown,
  ) {
    this.opts = opts;
    this.send = vi.fn();
    this.destroy = vi.fn();
  }),
}));

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

const SignalingMock = SessionSignalingSocket as unknown as Mock;
const PeerMock = SimplePeer as unknown as Mock;

interface FakeSignaling {
  opts: {
    onFrame: (frame: unknown) => void;
    onOpen: () => void;
    onClosed: () => void;
  };
  send: Mock;
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

const signaling = (): FakeSignaling => SignalingMock.mock.instances[0] as FakeSignaling;
const peer = (index: number): FakePeer => PeerMock.mock.results[index]!.value as FakePeer;

describe('SyncedSessionTransport', () => {
  beforeEach(() => {
    SignalingMock.mockClear();
    PeerMock.mockClear();
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
