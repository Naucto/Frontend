import { SessionRole } from "@engine/net/SessionTransport";

import { SessionSignalingSocket } from "./SessionSignalingSocket";
import { SyncedSessionTransport, SyncedSessionTransportOptions } from "./SyncedSessionTransport";

import SimplePeer from "simple-peer";

jest.mock("./SessionSignalingSocket", () => ({
  SessionSignalingSocket: jest.fn().mockImplementation(function (this: Record<string, unknown>, opts: unknown) {
    this.opts = opts;
    this.send = jest.fn();
    this.destroy = jest.fn();
  }),
}));

jest.mock("simple-peer", () =>
  jest.fn().mockImplementation(() => {
    const handlers: Record<string, (arg?: unknown) => void> = {};
    return {
      on(event: string, cb: (arg?: unknown) => void): void {
        handlers[event] = cb;
      },
      signal: jest.fn(),
      send: jest.fn(),
      destroy: jest.fn(),
      fire(event: string, arg?: unknown): void {
        handlers[event]?.(arg);
      },
    };
  }),
);

const SignalingMock = SessionSignalingSocket as unknown as jest.Mock;
const PeerMock = SimplePeer as unknown as jest.Mock;

interface FakeSignaling {
  opts: {
    onFrame: (frame: unknown) => void;
    onOpen: () => void;
    onClosed: () => void;
  };
  send: jest.Mock;
}

interface FakePeer {
  signal: jest.Mock;
  send: jest.Mock;
  fire: (event: string, arg?: unknown) => void;
}

const options = (role: SessionRole, selfUserId: number): SyncedSessionTransportOptions => ({
  role,
  selfUserId,
  signalingUrl: "ws://signal",
  ticket: "ticket",
  ticketIssuedAt: Date.now(),
  iceServers: [],
  refreshTicket: async () => null,
});

const signaling = (): FakeSignaling => SignalingMock.mock.instances[0] as unknown as FakeSignaling;
const peer = (index: number): FakePeer => PeerMock.mock.results[index]!.value as FakePeer;

describe("SyncedSessionTransport", () => {
  beforeEach(() => {
    SignalingMock.mockClear();
    PeerMock.mockClear();
  });

  it("relays a slave request over the WS when no data channel is up", () => {
    const transport = new SyncedSessionTransport(options("slave", 2));

    transport.sendRequest({ move: 1 });

    expect(signaling().send).toHaveBeenCalledWith({ type: "request", data: { move: 1 } });
    transport.destroy();
  });

  it("emits a relayed request to the host", () => {
    const transport = new SyncedSessionTransport(options("host", 1));
    const received: Array<{ from: number; data: unknown }> = [];
    transport.on("request", (from, data) => received.push({ from, data }));

    signaling().opts.onFrame({ type: "request", from: 2, data: { a: 1 } });

    expect(received).toEqual([{ from: 2, data: { a: 1 } }]);
    transport.destroy();
  });

  it("emits relayed state to a slave with no data channel", () => {
    const transport = new SyncedSessionTransport(options("slave", 2));
    const states: unknown[] = [];
    transport.on("state", data => states.push(data));

    signaling().opts.onFrame({ type: "state", data: { hp: 5 } });

    expect(states).toEqual([{ hp: 5 }]);
    transport.destroy();
  });

  it("falls back to a relay broadcast after the P2P timeout", () => {
    jest.useFakeTimers();
    const transport = new SyncedSessionTransport(options("host", 1));
    const joined: number[] = [];
    transport.on("peerJoined", id => joined.push(id));

    signaling().opts.onFrame({ type: "peer-joined", userId: 2 });
    jest.advanceTimersByTime(9_000);

    expect(joined).toEqual([2]);

    transport.broadcastState({ x: 1 });
    expect(signaling().send).toHaveBeenCalledWith({ type: "state", data: { x: 1 } });

    transport.destroy();
    jest.useRealTimers();
  });

  it("sends over the data channel once a slave's P2P connects", () => {
    const transport = new SyncedSessionTransport(options("slave", 2));

    signaling().opts.onOpen();
    peer(0).fire("connect");

    transport.sendRequest({ move: 2 });

    expect(peer(0).send).toHaveBeenCalledWith(JSON.stringify({ type: "request", data: { move: 2 } }));
    expect(signaling().send).not.toHaveBeenCalled();
    transport.destroy();
  });
});
