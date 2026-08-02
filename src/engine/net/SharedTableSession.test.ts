import { NetPermissions } from "./NetPermissions";
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

function makeSession(role: SessionRole, userId: UserId, hub: Hub, permissions?: NetPermissions): SharedTableSession {
  const transport = new MockTransport(role, userId, hub);
  const session = new SharedTableSession(transport, permissions);
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

  it("buffers live state until the snapshot so a joiner never reads a half-populated table", async () => {
    const hub = new Hub();
    const host = makeSession("host", 1, hub);

    // Host seeds a table whose two sides are owned by different players.
    host.setValue("pads.left", 10);
    host.setValue("pads.right", 20);
    await flush();

    // Reproduce the real race: a live patch for the host's own side reaches the
    // joiner before its baseline snapshot. Wire the session, deliver the patch,
    // then register (which fires peerJoined -> snapshot).
    const transport = new MockTransport("slave", 2, hub);
    const slave = new SharedTableSession(transport);
    transport.fire("state", { kind: "patch", ops: [{ path: "pads.left", op: "set", value: 11, version: 2 }] });

    // Nothing applied yet: net.state.pads must not appear half-populated.
    expect(slave.getValue("pads.left")).toBeUndefined();
    expect(slave.getValue("pads.right")).toBeUndefined();
    expect(slave.isContainer("pads")).toBe(false);

    hub.register(transport);

    // Snapshot brought both sides; the buffered patch replays on top.
    expect(slave.getValue("pads.right")).toBe(20);
    expect(slave.getValue("pads.left")).toBe(11);
  });

  it("coalesces streamed writes to an in-flight path instead of throwing", async () => {
    // A manual transport whose acks are delivered by the test, so a path can be
    // kept in flight across writes (the auto-acking Hub settles synchronously).
    const sent: Array<{ reqId: string; ops: Array<Record<string, unknown>> }> = [];
    const handlers = new Map<string, AnyListener>();
    const transport: SessionTransport = {
      role: "slave",
      selfUserId: 2,
      broadcastState: () => {},
      respondTo: () => {},
      sendRequest: (data) => sent.push(data as { reqId: string; ops: Array<Record<string, unknown>> }),
      on: (event, listener) => { handlers.set(event, listener as AnyListener); },
      off: () => {},
      destroy: () => {},
    };
    const fire = (event: string, ...args: unknown[]): void => handlers.get(event)?.(...args);

    const slave = new SharedTableSession(transport);
    fire("response", { kind: "snapshot", entries: [{ path: "pads.right", value: 0, version: 1 }], sidecar: [] });

    slave.setValue("pads.right", 5);
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.ops[0]).toMatchObject({ path: "pads.right", value: 5, baseVersion: 1 });

    // More writes while the first is still in flight must not throw; they coalesce.
    expect(() => slave.setValue("pads.right", 6)).not.toThrow();
    expect(() => slave.setValue("pads.right", 7)).not.toThrow();
    await flush();
    expect(sent).toHaveLength(1);              // nothing new sent while in flight
    expect(slave.getValue("pads.right")).toBe(7); // local prediction is the latest

    // The ack settles the version; the coalesced latest is then sent once.
    fire("response", { kind: "write-ack", reqId: sent[0]!.reqId, results: [{ path: "pads.right", version: 2 }] });
    await flush();
    expect(sent).toHaveLength(2);
    expect(sent[1]!.ops[0]).toMatchObject({ path: "pads.right", value: 7, baseVersion: 2 });
  });

  it("ignores the host's echo of a value the client is still driving", async () => {
    const sent: Array<{ reqId: string; ops: Array<Record<string, unknown>> }> = [];
    const handlers = new Map<string, AnyListener>();
    const transport: SessionTransport = {
      role: "slave",
      selfUserId: 2,
      broadcastState: () => {},
      respondTo: () => {},
      sendRequest: (data) => sent.push(data as { reqId: string; ops: Array<Record<string, unknown>> }),
      on: (event, listener) => { handlers.set(event, listener as AnyListener); },
      off: () => {},
      destroy: () => {},
    };
    const fire = (event: string, ...args: unknown[]): void => handlers.get(event)?.(...args);

    const slave = new SharedTableSession(transport);
    fire("response", { kind: "snapshot", entries: [{ path: "pads.right", value: 0, version: 1 }], sidecar: [] });

    slave.setValue("pads.right", 5);
    await flush();                    // pads.right now in flight
    slave.setValue("pads.right", 9);  // newer local prediction (coalesced)

    // The host echoes the older value back; the owner must keep its prediction.
    fire("state", { kind: "patch", ops: [{ path: "pads.right", op: "set", value: 5, version: 2 }] });
    expect(slave.getValue("pads.right")).toBe(9);

    // A host-owned path (nothing pending locally) still applies normally.
    fire("state", { kind: "patch", ops: [{ path: "ball.x", op: "set", value: 42, version: 2 }] });
    expect(slave.getValue("ball.x")).toBe(42);
  });

  it("rejects a client write to a path without CLIENT_WRITE and rolls it back", async () => {
    const hub = new Hub();
    const perms: NetPermissions = { canClientWrite: (p) => p !== "score", canClientRead: () => true };
    const host = makeSession("host", 1, hub, perms);
    const slave = makeSession("slave", 2, hub);
    const errors: Array<{ path: string; reason: string }> = [];
    slave.onError((path, reason) => errors.push({ path, reason }));

    slave.setValue("score", 99);
    await flush();

    expect(slave.getValue("score")).toBeUndefined();  // optimistic write rolled back
    expect(host.getValue("score")).toBeUndefined();    // never applied on the host
    expect(errors).toContainEqual({ path: "score", reason: "forbidden" });

    // A permitted path still writes through.
    slave.setValue("players.2.x", 5);
    await flush();
    expect(host.getValue("players.2.x")).toBe(5);
  });

  it("withholds a server-private path from the client snapshot", async () => {
    const hub = new Hub();
    const perms: NetPermissions = { canClientWrite: () => true, canClientRead: (p) => p !== "secret" };
    const host = makeSession("host", 1, hub, perms);

    host.setValue("secret", 42);
    host.setValue("public", 7);
    await flush();

    const slave = makeSession("slave", 2, hub);  // register fires the host snapshot
    expect(slave.getValue("public")).toBe(7);
    expect(slave.getValue("secret")).toBeUndefined();
  });

  it("withholds a server-private path from live broadcasts", async () => {
    const hub = new Hub();
    const perms: NetPermissions = { canClientWrite: () => true, canClientRead: (p) => p !== "secret" };
    const host = makeSession("host", 1, hub, perms);
    const slave = makeSession("slave", 2, hub);

    host.setValue("secret", 1);
    host.setValue("visible", 2);
    await flush();

    expect(slave.getValue("visible")).toBe(2);
    expect(slave.getValue("secret")).toBeUndefined();
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
