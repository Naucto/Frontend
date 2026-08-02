import { SessionTransport, UserId } from "./SessionTransport";

export type TableScalar = number | string | boolean;

export type TableChangeListener = (
  path: string,
  newValue: TableScalar | undefined,
  oldValue: TableScalar | undefined,
) => void;

export type TableEventListener = (from: UserId, payload: unknown) => void;

interface TableEntry {
  value: TableScalar;
  version: number;
}

type PatchOp =
  | { path: string; op: "set"; value: TableScalar; version: number }
  | { path: string; op: "del"; version: number };

type WriteOp =
  | { path: string; op: "set"; value: TableScalar; baseVersion: number }
  | { path: string; op: "del"; baseVersion: number };

type SnapshotPayload = {
  kind: "snapshot";
  entries: Array<{ path: string; value: TableScalar; version: number }>;
  sidecar: Array<{ key: string; value: unknown }>;
};

type StatePayload =
  | { kind: "patch"; ops: PatchOp[] }
  | { kind: "sidecar"; key: string; value: unknown }
  | { kind: "event"; name: string; from: UserId; payload: unknown };

// Sidecar keys: lock owner (UserId | null) and queue contents (array), kept out
// of the user-visible net.state store but synced and snapshotted like it.
const LOCK_KEY = "lock:";
const QUEUE_KEY = "queue:";

type RequestPayload =
  | { kind: "write"; reqId: string; ops: WriteOp[] }
  | { kind: "event"; name: string; payload: unknown }
  | { kind: "lock"; reqId: string; path: string; action: "acquire" | "release" }
  | { kind: "queue"; reqId: string; path: string; op: "push" | "pop"; value?: unknown };

// Bootstrap snapshot is a targeted host -> one slave message, so it rides the
// response channel alongside write acks/nacks rather than the broadcast channel.
type ResponsePayload =
  | { kind: "write-ack"; reqId: string; results: Array<{ path: string; version: number }> }
  | { kind: "write-nack"; reqId: string; rejected: Array<{ path: string }> }
  | { kind: "lock-grant"; reqId: string }
  | { kind: "queue-result"; reqId: string; value: unknown }
  | SnapshotPayload;

type PeerEvent = "joined" | "left";

interface InflightWrite {
  paths: string[];
  previous: Map<string, TableEntry | undefined>;
}

interface LockWaiter {
  userId: UserId;
  reqId?: string;
  grant?: () => void;
}

const compilePattern = (pattern: string): RegExp => {
  let out = "";

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;

    if (c === "*" && pattern[i + 1] === "*") {
      out += ".*";
      i++;
    } else if (c === "*") {
      out += "[^.]+";
    } else if (/[.+?^${}()|[\]\\]/.test(c)) {
      out += "\\" + c;
    } else {
      out += c;
    }
  }

  return new RegExp("^" + out + "$");
};

export class SharedTableSession implements Destroyable {
  private readonly _transport: SessionTransport;
  private readonly _isHost: boolean;

  private readonly _store = new Map<string, TableEntry>();

  // A slave must apply the host's baseline snapshot before any live patch, or the
  // game can read a half-populated table — e.g. net.state.pads holding only the
  // host's own side while the joiner's side hasn't replicated yet. Live state is
  // buffered until the snapshot lands, then replayed on top of it. The host owns
  // the authoritative store and never waits for a snapshot.
  private _snapshotApplied: boolean;
  private readonly _bufferedState: StatePayload[] = [];

  private readonly _pendingPatch: PatchOp[] = [];
  private readonly _pendingWrite: WriteOp[] = [];
  private _pendingBefore = new Map<string, TableEntry | undefined>();
  private _flushScheduled = false;

  private readonly _inflight = new Map<string, InflightWrite>();
  private readonly _inflightPaths = new Set<string>();
  // Latest desired write per path that arrived while that path had an in-flight
  // write; flushed once the in-flight ack settles the version (write coalescing).
  private readonly _deferredWrites = new Map<
    string,
    { op: "set"; value: TableScalar } | { op: "del" }
  >();
  private _reqCounter = 0;

  private readonly _changeSubs: Array<{ regex: RegExp; cb: TableChangeListener }> = [];
  private readonly _eventSubs = new Map<string, Set<TableEventListener>>();
  private readonly _errorSubs = new Set<(path: string, reason: string) => void>();
  private readonly _peerSubs = new Map<PeerEvent, Set<(userId: UserId) => void>>();
  private readonly _endedSubs = new Set<() => void>();

  // Synced, host-authoritative, hidden from net.state: lock owners + queue contents.
  private readonly _sidecar = new Map<string, unknown>();
  // Host-internal lock grant order (carries the reqId/callback to wake a waiter).
  private readonly _lockWaiters = new Map<string, LockWaiter[]>();
  private readonly _pendingLocks = new Map<string, () => void>();
  private readonly _pendingPops = new Map<string, (value: unknown) => void>();

  constructor(transport: SessionTransport) {
    this._transport = transport;
    this._isHost = transport.role === "host";
    this._snapshotApplied = this._isHost;

    transport.on("state", data => this._onState(data as StatePayload));
    transport.on("request", (from, data) => this._onRequest(from, data as RequestPayload));
    transport.on("response", data => this._onResponse(data as ResponsePayload));
    transport.on("peerJoined", userId => this._onPeerJoined(userId));
    transport.on("peerLeft", userId => this._onPeerLeft(userId));
    transport.on("ended", () => this._endedSubs.forEach(cb => cb()));
  }

  destroy(): void {
    this._transport.destroy();
    this._changeSubs.length = 0;
    this._eventSubs.clear();
    this._errorSubs.clear();
    this._peerSubs.clear();
    this._endedSubs.clear();
    this._sidecar.clear();
    this._pendingPops.clear();
    this._store.clear();
    this._bufferedState.length = 0;
    this._deferredWrites.clear();
  }

  get isHost(): boolean {
    return this._isHost;
  }

  get selfUserId(): UserId {
    return this._transport.selfUserId;
  }

  getValue(path: string): TableScalar | undefined {
    return this._store.get(path)?.value;
  }

  isContainer(path: string): boolean {
    const prefix = path === "" ? "" : path + ".";

    for (const key of this._store.keys()) {
      if (key !== path && key.startsWith(prefix))
        return true;
    }

    return false;
  }

  childKeys(path: string): string[] {
    const prefix = path === "" ? "" : path + ".";
    const children = new Set<string>();

    for (const key of this._store.keys()) {
      if (path !== "" && !key.startsWith(prefix))
        continue;

      const rest = key.slice(prefix.length);
      if (rest.length === 0)
        continue;

      const dot = rest.indexOf(".");
      children.add(dot === -1 ? rest : rest.slice(0, dot));
    }

    return [...children];
  }

  setValue(path: string, value: TableScalar): void {
    if (this._isHost) {
      this._hostSet(path, value);
      return;
    }

    const baseVersion = this._store.get(path)?.version ?? 0;
    this._captureBefore(path);
    this._writeEntry(path, value, baseVersion);

    // A path with an in-flight write can't be re-sent yet (its server version
    // isn't settled). Coalesce to the latest value locally and send it once the
    // ack lands, so a client can stream an owned value (e.g. its paddle) every
    // frame without self-conflicting.
    if (this._inflightPaths.has(path)) {
      this._deferredWrites.set(path, { op: "set", value });
      return;
    }

    this._pendingWrite.push({ path, op: "set", value, baseVersion });
    this._scheduleFlush();
  }

  deleteSubtree(path: string): void {
    const paths = this._descendants(path);

    if (this._isHost) {
      for (const p of paths)
        this._hostDelete(p);
      return;
    }

    for (const p of paths) {
      const baseVersion = this._store.get(p)?.version ?? 0;
      this._captureBefore(p);
      this._removeEntry(p);

      // Same coalescing as setValue: defer a delete for a path still in flight.
      if (this._inflightPaths.has(p)) {
        this._deferredWrites.set(p, { op: "del" });
        continue;
      }

      this._pendingWrite.push({ path: p, op: "del", baseVersion });
    }

    this._scheduleFlush();
  }

  emit(name: string, payload: unknown): void {
    if (this._isHost) {
      this._transport.broadcastState({ kind: "event", name, from: this._transport.selfUserId, payload });
      return;
    }

    this._transport.sendRequest({ kind: "event", name, payload });
  }

  onChange(pattern: string, cb: TableChangeListener): void {
    this._changeSubs.push({ regex: compilePattern(pattern), cb });
  }

  onEvent(name: string, cb: TableEventListener): void {
    const set = this._eventSubs.get(name) ?? new Set<TableEventListener>();
    set.add(cb);
    this._eventSubs.set(name, set);
  }

  onError(cb: (path: string, reason: string) => void): void {
    this._errorSubs.add(cb);
  }

  onPeer(event: PeerEvent, cb: (userId: UserId) => void): void {
    const set = this._peerSubs.get(event) ?? new Set<(userId: UserId) => void>();
    set.add(cb);
    this._peerSubs.set(event, set);
  }

  onEnded(cb: () => void): void {
    this._endedSubs.add(cb);
  }

  acquireLock(path: string, onGranted: () => void): void {
    if (this._isHost) {
      this._hostAcquire(this._transport.selfUserId, path, undefined, onGranted);
      return;
    }

    const reqId = `${this._transport.selfUserId}-lock-${this._reqCounter++}`;
    this._pendingLocks.set(reqId, onGranted);
    this._transport.sendRequest({ kind: "lock", reqId, path, action: "acquire" });
  }

  releaseLock(path: string): void {
    if (this._isHost) {
      this._hostRelease(this._transport.selfUserId, path);
      return;
    }

    this._transport.sendRequest({ kind: "lock", reqId: "", path, action: "release" });
  }

  queuePush(path: string, value: unknown): void {
    if (this._isHost) {
      this._enqueue(path, value);
      return;
    }

    this._transport.sendRequest({ kind: "queue", reqId: "", path, op: "push", value });
  }

  queuePop(path: string, onResult: (value: unknown) => void): void {
    if (this._isHost) {
      onResult(this._dequeue(path));
      return;
    }

    const reqId = `${this._transport.selfUserId}-pop-${this._reqCounter++}`;
    this._pendingPops.set(reqId, onResult);
    this._transport.sendRequest({ kind: "queue", reqId, path, op: "pop" });
  }

  isLocked(path: string): boolean {
    return this._lockOwnerOf(LOCK_KEY + path) !== null;
  }

  queueLength(path: string): number {
    return this._queueArray(QUEUE_KEY + path).length;
  }

  queuePeek(path: string): unknown {
    return this._queueArray(QUEUE_KEY + path)[0];
  }

  private _captureBefore(path: string): void {
    if (!this._pendingBefore.has(path))
      this._pendingBefore.set(path, this._store.get(path));
  }

  // Re-queue writes coalesced while their path was in flight, now that the ack
  // has settled the base version. The latest value is already applied locally.
  private _flushDeferred(paths: string[]): void {
    let queued = false;

    for (const path of paths) {
      const deferred = this._deferredWrites.get(path);
      if (!deferred)
        continue;

      this._deferredWrites.delete(path);
      const baseVersion = this._store.get(path)?.version ?? 0;
      this._captureBefore(path);

      if (deferred.op === "set")
        this._pendingWrite.push({ path, op: "set", value: deferred.value, baseVersion });
      else
        this._pendingWrite.push({ path, op: "del", baseVersion });

      queued = true;
    }

    if (queued)
      this._scheduleFlush();
  }

  private _hostSet(path: string, value: TableScalar): void {
    const version = (this._store.get(path)?.version ?? 0) + 1;
    this._writeEntry(path, value, version);
    this._pendingPatch.push({ path, op: "set", value, version });
    this._scheduleFlush();
  }

  private _hostDelete(path: string): void {
    const version = (this._store.get(path)?.version ?? 0) + 1;
    this._removeEntry(path);
    this._pendingPatch.push({ path, op: "del", version });
    this._scheduleFlush();
  }

  private _scheduleFlush(): void {
    if (this._flushScheduled)
      return;

    this._flushScheduled = true;
    queueMicrotask(() => this._flush());
  }

  private _flush(): void {
    this._flushScheduled = false;

    if (this._isHost) {
      if (this._pendingPatch.length === 0)
        return;

      this._transport.broadcastState({ kind: "patch", ops: [...this._pendingPatch] });
      this._pendingPatch.length = 0;
      return;
    }

    if (this._pendingWrite.length === 0)
      return;

    const reqId = `${this._transport.selfUserId}-${this._reqCounter++}`;
    const ops = [...this._pendingWrite];
    this._pendingWrite.length = 0;

    const paths = [...new Set(ops.map((op) => op.path))];
    const previous = this._pendingBefore;
    this._pendingBefore = new Map();

    for (const p of paths)
      this._inflightPaths.add(p);

    this._inflight.set(reqId, { paths, previous });
    this._transport.sendRequest({ kind: "write", reqId, ops });
  }

  private _onState(payload: StatePayload): void {
    // Hold live state until the baseline snapshot has been applied (slave only),
    // then replay it in arrival order on top of the snapshot.
    if (!this._snapshotApplied) {
      this._bufferedState.push(payload);
      return;
    }

    if (payload.kind === "patch") {
      for (const op of payload.ops) {
        if (op.op === "set")
          this._writeEntry(op.path, op.value, op.version);
        else
          this._removeEntry(op.path);
      }
      return;
    }

    if (payload.kind === "sidecar") {
      this._sidecar.set(payload.key, payload.value);
      return;
    }

    this._dispatchEvent(payload.name, payload.from, payload.payload);
  }

  private _onRequest(from: UserId, payload: RequestPayload): void {
    if (payload.kind === "event") {
      this._transport.broadcastState({ kind: "event", name: payload.name, from, payload: payload.payload });
      this._dispatchEvent(payload.name, from, payload.payload);
      return;
    }

    if (payload.kind === "lock") {
      if (payload.action === "acquire")
        this._hostAcquire(from, payload.path, payload.reqId, undefined);
      else
        this._hostRelease(from, payload.path);

      return;
    }

    if (payload.kind === "queue") {
      if (payload.op === "push")
        this._enqueue(payload.path, payload.value);
      else
        this._transport.respondTo(from, { kind: "queue-result", reqId: payload.reqId, value: this._dequeue(payload.path) });

      return;
    }

    this._handleWrite(from, payload);
  }

  private _handleWrite(from: UserId, payload: { reqId: string; ops: WriteOp[] }): void {
    const conflict = payload.ops.find((op) => (this._store.get(op.path)?.version ?? 0) !== op.baseVersion);

    if (conflict) {
      this._transport.respondTo(from, {
        kind: "write-nack",
        reqId: payload.reqId,
        rejected: [{ path: conflict.path }],
      });
      return;
    }

    const results: Array<{ path: string; version: number }> = [];

    for (const op of payload.ops) {
      if (op.op === "set")
        this._hostSet(op.path, op.value);
      else
        this._hostDelete(op.path);

      results.push({ path: op.path, version: this._store.get(op.path)?.version ?? 0 });
    }

    this._transport.respondTo(from, { kind: "write-ack", reqId: payload.reqId, results });
  }

  private _onResponse(payload: ResponsePayload): void {
    if (payload.kind === "snapshot") {
      for (const entry of payload.entries)
        this._writeEntry(entry.path, entry.value, entry.version);
      for (const item of payload.sidecar)
        this._sidecar.set(item.key, item.value);

      // Baseline is in place: apply anything that arrived while we were waiting,
      // in order, so later host writes win over the snapshot.
      this._snapshotApplied = true;
      const buffered = this._bufferedState.splice(0);
      for (const state of buffered)
        this._onState(state);

      return;
    }

    if (payload.kind === "lock-grant") {
      const grant = this._pendingLocks.get(payload.reqId);

      if (grant) {
        this._pendingLocks.delete(payload.reqId);
        grant();
      }

      return;
    }

    if (payload.kind === "queue-result") {
      const onResult = this._pendingPops.get(payload.reqId);

      if (onResult) {
        this._pendingPops.delete(payload.reqId);
        onResult(payload.value);
      }

      return;
    }

    const inflight = this._inflight.get(payload.reqId);

    if (!inflight)
      return;

    this._inflight.delete(payload.reqId);
    for (const p of inflight.paths)
      this._inflightPaths.delete(p);

    if (payload.kind === "write-ack") {
      for (const result of payload.results) {
        const entry = this._store.get(result.path);
        if (entry)
          entry.version = result.version;
      }
      // The version is now settled; flush any value coalesced while in flight.
      this._flushDeferred(inflight.paths);
      return;
    }

    for (const p of inflight.paths) {
      // A rejected write invalidates any follow-up we were holding for it.
      this._deferredWrites.delete(p);

      const before = inflight.previous.get(p);

      if (before === undefined)
        this._removeEntry(p);
      else
        this._writeEntry(p, before.value, before.version);
    }

    for (const rejected of payload.rejected)
      this._errorSubs.forEach((cb) => cb(rejected.path, "conflict"));
  }

  private _onPeerJoined(userId: UserId): void {
    this._sendSnapshot(userId);
    this._dispatchPeer("joined", userId);
  }

  private _onPeerLeft(userId: UserId): void {
    const owned = [...this._sidecar.entries()]
      .filter(([key, owner]) => key.startsWith(LOCK_KEY) && owner === userId)
      .map(([key]) => key.slice(LOCK_KEY.length));
    for (const path of owned)
      this._hostRelease(userId, path);

    for (const [path, waiters] of this._lockWaiters)
      this._lockWaiters.set(path, waiters.filter(waiter => waiter.userId !== userId));

    this._dispatchPeer("left", userId);
  }

  private _dispatchPeer(event: PeerEvent, userId: UserId): void {
    this._peerSubs.get(event)?.forEach(cb => cb(userId));
  }

  private _hostAcquire(userId: UserId, path: string, reqId: string | undefined, grant: (() => void) | undefined): void {
    const key = LOCK_KEY + path;

    if (this._lockOwnerOf(key) === null) {
      this._writeSidecar(key, userId);
      this._grantLock(userId, reqId, grant);
      return;
    }

    const waiters = this._lockWaiters.get(path) ?? [];
    waiters.push({ userId, reqId, grant });
    this._lockWaiters.set(path, waiters);
  }

  private _hostRelease(userId: UserId, path: string): void {
    const key = LOCK_KEY + path;

    if (this._lockOwnerOf(key) !== userId)
      return;

    const next = this._lockWaiters.get(path)?.shift();

    if (next) {
      this._writeSidecar(key, next.userId);
      this._grantLock(next.userId, next.reqId, next.grant);
    } else {
      this._writeSidecar(key, null);
    }
  }

  private _grantLock(userId: UserId, reqId: string | undefined, grant: (() => void) | undefined): void {
    if (userId === this._transport.selfUserId)
      grant?.();
    else if (reqId !== undefined)
      this._transport.respondTo(userId, { kind: "lock-grant", reqId });
  }

  private _lockOwnerOf(key: string): UserId | null {
    const owner = this._sidecar.get(key);
    return typeof owner === "number" ? owner : null;
  }

  private _enqueue(path: string, value: unknown): void {
    const key = QUEUE_KEY + path;
    this._writeSidecar(key, [...this._queueArray(key), value]);
  }

  private _dequeue(path: string): unknown {
    const key = QUEUE_KEY + path;
    const queue = this._queueArray(key);

    if (queue.length === 0)
      return undefined;

    const [head, ...rest] = queue;
    this._writeSidecar(key, rest);

    return head;
  }

  private _queueArray(key: string): unknown[] {
    const queue = this._sidecar.get(key);
    return Array.isArray(queue) ? queue : [];
  }

  private _writeSidecar(key: string, value: unknown): void {
    this._sidecar.set(key, value);
    this._transport.broadcastState({ kind: "sidecar", key, value });
  }

  private _sendSnapshot(userId: UserId): void {
    const entries = [...this._store.entries()].map(([path, entry]) => ({
      path,
      value: entry.value,
      version: entry.version,
    }));
    const sidecar = [...this._sidecar.entries()].map(([key, value]) => ({ key, value }));

    this._transport.respondTo(userId, { kind: "snapshot", entries, sidecar });
  }

  private _writeEntry(path: string, value: TableScalar, version: number): void {
    const previous = this._store.get(path);
    this._store.set(path, { value, version });
    this._fireChange(path, value, previous?.value);
  }

  private _removeEntry(path: string): void {
    const previous = this._store.get(path);

    if (previous === undefined)
      return;

    this._store.delete(path);
    this._fireChange(path, undefined, previous.value);
  }

  private _descendants(path: string): string[] {
    const prefix = path + ".";
    const paths: string[] = [];

    for (const key of this._store.keys()) {
      if (key === path || key.startsWith(prefix))
        paths.push(key);
    }

    return paths;
  }

  private _fireChange(path: string, newValue: TableScalar | undefined, oldValue: TableScalar | undefined): void {
    if (newValue === oldValue)
      return;

    for (const sub of this._changeSubs) {
      if (sub.regex.test(path))
        sub.cb(path, newValue, oldValue);
    }
  }

  private _dispatchEvent(name: string, from: UserId, payload: unknown): void {
    if (from === this._transport.selfUserId)
      return;

    this._eventSubs.get(name)?.forEach((cb) => cb(from, payload));
  }
}
