import {
  SessionRole,
  SessionTransport,
  SessionTransportEvents,
  UserId,
} from "./SessionTransport";
import { SharedTableSession } from "./SharedTableSession";

type AnyListener = (...args: unknown[]) => void;

// An in-memory star hub that routes frames between a host transport and N slave
// transports with the same semantics as the backend relay, so SharedTableSession
// can be exercised headlessly.
class Hub {
  private host?: MockTransport;
  private readonly slaves = new Map<UserId, MockTransport>();

  register(transport: MockTransport): void {
    if (transport.role === "host") {
      this.host = transport;
      return;
    }

    this.slaves.set(transport.selfUserId, transport);
    this.host?.fire("peerJoined", transport.selfUserId);
  }

  broadcastState(data: unknown): void {
    for (const slave of this.slaves.values())
      slave.fire("state", data);
  }

  respondTo(userId: UserId, data: unknown): void {
    this.slaves.get(userId)?.fire("response", data);
  }

  sendRequest(from: UserId, data: unknown): void {
    this.host?.fire("request", from, data);
  }
}

class MockTransport implements SessionTransport {
  private readonly listeners = new Map<keyof SessionTransportEvents, Set<AnyListener>>();

  constructor(
    public readonly role: SessionRole,
    public readonly selfUserId: UserId,
    private readonly hub: Hub,
  ) {}

  broadcastState(data: unknown): void {
    this.hub.broadcastState(data);
  }

  respondTo(userId: UserId, data: unknown): void {
    this.hub.respondTo(userId, data);
  }

  sendRequest(data: unknown): void {
    this.hub.sendRequest(this.selfUserId, data);
  }

  on<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void {
    const set = this.listeners.get(event) ?? new Set<AnyListener>();
    set.add(listener as AnyListener);
    this.listeners.set(event, set);
  }

  off<E extends keyof SessionTransportEvents>(event: E, listener: SessionTransportEvents[E]): void {
    this.listeners.get(event)?.delete(listener as AnyListener);
  }

  fire<E extends keyof SessionTransportEvents>(event: E, ...args: Parameters<SessionTransportEvents[E]>): void {
    this.listeners.get(event)?.forEach((listener) => listener(...args));
  }

  destroy(): void {
    this.listeners.clear();
  }
}

// Drain the microtask cascade (write request -> host apply -> ack/patch -> rollback).
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++)
    await Promise.resolve();
};

function makeSession(role: SessionRole, userId: UserId, hub: Hub): SharedTableSession {
  const transport = new MockTransport(role, userId, hub);
  const session = new SharedTableSession(transport);
  hub.register(transport);
  return session;
}

describe("SharedTableSession", () => {
  it("propagates a host write to a slave as a patch", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);
    const slave = makeSession("slave", 2, hub);

    host.setValue("score", 10);
    await flush();

    expect(slave.getValue("score")).toBe(10);
  });

  it("bootstraps a late-joining slave with a snapshot", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);

    host.setValue("score", 42);
    await flush();

    const slave = makeSession("slave", 2, hub);

    expect(slave.getValue("score")).toBe(42);
  });

  it("applies a slave write through the host and acks it", async () => {
    const hub = new Hub();
    makeSession("host", 1, hub);
    const slave = makeSession("slave", 2, hub);

    slave.setValue("players.alice.x", 5);
    await flush();

    expect(slave.getValue("players.alice.x")).toBe(5);
  });

  it("nacks a conflicting slave write and rolls it back", async () => {
    const hub = new Hub();
    makeSession("host", 1, hub);
    const slaveA = makeSession("slave", 2, hub);
    const slaveB = makeSession("slave", 3, hub);

    const errors: Array<{ path: string; reason: string }> = [];
    slaveB.onError((path, reason) => errors.push({ path, reason }));

    // Both write "x" off the same base version before either is reconciled; the
    // host applies A first, so B's stale-based write is rejected.
    slaveA.setValue("x", 1);
    slaveB.setValue("x", 2);
    await flush();

    expect(errors).toEqual([{ path: "x", reason: "conflict" }]);
    expect(slaveB.getValue("x")).toBe(1);
    expect(slaveA.getValue("x")).toBe(1);
  });

  it("relays a custom event from a slave to other peers, not the sender", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);
    const slaveA = makeSession("slave", 2, hub);
    const slaveB = makeSession("slave", 3, hub);

    const hostSeen: unknown[] = [];
    const aSeen: unknown[] = [];
    const bSeen: unknown[] = [];
    host.onEvent("ping", (_from, payload) => hostSeen.push(payload));
    slaveA.onEvent("ping", (_from, payload) => aSeen.push(payload));
    slaveB.onEvent("ping", (_from, payload) => bSeen.push(payload));

    slaveA.emit("ping", { n: 1 });
    await flush();

    expect(hostSeen).toEqual([{ n: 1 }]);
    expect(bSeen).toEqual([{ n: 1 }]);
    expect(aSeen).toEqual([]);
  });

  it("fires namespaced change listeners", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);
    const slave = makeSession("slave", 2, hub);

    const hits: string[] = [];
    slave.onChange("players.*", (path) => hits.push(path));

    host.setValue("players.alice", 1);
    host.setValue("score", 9);
    await flush();

    expect(hits).toEqual(["players.alice"]);
  });

  it("notifies the host when a peer joins", () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);

    const joined: number[] = [];
    host.onPeer("joined", id => joined.push(id));

    makeSession("slave", 2, hub);

    expect(joined).toEqual([2]);
  });

  it("serializes a lock and grants a waiting slave on release", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);
    const slave = makeSession("slave", 2, hub);

    const order: string[] = [];
    host.acquireLock("score", () => order.push("host"));
    slave.acquireLock("score", () => order.push("slave"));
    await flush();

    expect(order).toEqual(["host"]);

    host.releaseLock("score");
    await flush();

    expect(order).toEqual(["host", "slave"]);
  });

  it("serializes a queue across host and slave, FIFO", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);
    const slave = makeSession("slave", 2, hub);

    slave.queuePush("events", "a");
    host.queuePush("events", "b");
    await flush();

    const popped: unknown[] = [];
    host.queuePop("events", value => popped.push(value));
    host.queuePop("events", value => popped.push(value));
    host.queuePop("events", value => popped.push(value));
    await flush();

    expect(popped).toEqual(["a", "b", undefined]);
  });

  it("returns a popped value to a slave", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);
    const slave = makeSession("slave", 2, hub);
    host.queuePush("q", 42);

    let got: unknown;
    slave.queuePop("q", value => {
      got = value;
    });
    await flush();

    expect(got).toBe(42);
  });

  it("replicates queue contents and lock ownership to slaves for local reads", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);
    const slave = makeSession("slave", 2, hub);

    host.queuePush("events", "a");
    host.queuePush("events", "b");
    host.acquireLock("turn", () => undefined);
    await flush();

    expect(slave.queueLength("events")).toBe(2);
    expect(slave.queuePeek("events")).toBe("a");
    expect(slave.isLocked("turn")).toBe(true);
  });

  it("bootstraps the sidecar to a late-joining slave", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);
    host.queuePush("events", "x");
    await flush();

    const slave = makeSession("slave", 2, hub);
    await flush();

    expect(slave.queueLength("events")).toBe(1);
  });
});
