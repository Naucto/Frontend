import type { Destroyable } from '../types';
import type { NetPermissions } from './NetPermissions';
import { ALLOW_ALL } from './NetPermissions';
import type { SessionTransport, UserId } from './SessionTransport';

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
  | { path: string; op: 'set'; value: TableScalar; version: number }
  | { path: string; op: 'del'; version: number };

type WriteOp =
  | { path: string; op: 'set'; value: TableScalar; baseVersion: number }
  | { path: string; op: 'del'; baseVersion: number };

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- a type alias narrows through isRecord(); an interface does not
type SnapshotPayload = {
  kind: 'snapshot';
  entries: { path: string; value: TableScalar; version: number }[];
};

type StatePayload =
  | { kind: 'patch'; ops: PatchOp[] }
  | { kind: 'event'; name: string; from: UserId; payload: unknown };

// Locks and queues live *in* net.state: a lock/queue object at net.state path P
// keeps its backing (type marker, lock owner, queue contents) under the reserved
// child branch `P.__netobj__.*`. Because that branch sits inside P's own dotted
// namespace, the ordinary store machinery replicates, snapshots, and deletes it
// for free; the proxy simply hides the reserved segment from user-facing reads.
const OBJECT_MARK = '__netobj__';
const RESERVED_INFIX = '.' + OBJECT_MARK;
const TYPE_SUFFIX = RESERVED_INFIX + '.type';
const OWNER_SUFFIX = RESERVED_INFIX + '.owner';
const QUEUE_SUFFIX = RESERVED_INFIX + '.q';

// A store key is reserved when it lives inside some object's `__netobj__` branch.
const isReserved = (key: string): boolean => key.includes(RESERVED_INFIX);

// The net.state path that owns a (possibly reserved) store key: for a reserved
// key this is the object's own path (everything before `.__netobj__`), and for a
// plain key it is the key itself. Used to map reserved storage back onto the
// object's path for permission checks and read filtering.
const ownerPathOf = (key: string): string => {
  const at = key.indexOf(RESERVED_INFIX);
  return at === -1 ? key : key.slice(0, at);
};

type RequestPayload =
  | { kind: 'write'; reqId: string; ops: WriteOp[] }
  | { kind: 'event'; name: string; payload: unknown }
  | { kind: 'lock'; reqId: string; path: string; action: 'acquire' | 'release' }
  | { kind: 'queue'; reqId: string; path: string; op: 'push' | 'pop'; value?: unknown };

// Bootstrap snapshot is a targeted host -> one slave message, so it rides the
// response channel alongside write acks/nacks rather than the broadcast channel.
type ResponsePayload =
  | { kind: 'write-ack'; reqId: string; results: { path: string; version: number }[] }
  | { kind: 'write-nack'; reqId: string; rejected: { path: string; reason?: string }[] }
  | { kind: 'lock-grant'; reqId: string }
  | { kind: 'queue-result'; reqId: string; value: unknown }
  | SnapshotPayload;

type PeerEvent = 'joined' | 'left';

interface InflightWrite {
  paths: string[];
  previous: Map<string, TableEntry | undefined>;
}

type DeferredWrite =
  | { op: 'set'; value: TableScalar; before: TableEntry | undefined }
  | { op: 'del'; before: TableEntry | undefined };

interface LockWaiter {
  userId: UserId;
  reqId?: string;
  grant?: () => void;
}

const compilePattern = (pattern: string): RegExp => {
  let out = '';

  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;

    if (c === '*' && pattern[i + 1] === '*') {
      out += '.*';
      i++;
    } else if (c === '*') {
      out += '[^.]+';
    } else if (/[.+?^${}()|[\]\\]/.test(c)) {
      out += '\\' + c;
    } else {
      out += c;
    }
  }

  return new RegExp('^' + out + '$');
};

// Frames arrive over the P2P data channel already JSON-parsed and are otherwise
// untrusted: a malicious or buggy peer bypasses the backend relay. Validate the
// shape before acting so a bad frame is dropped instead of throwing (which would
// break the host's session for everyone) or storing a non-scalar value.
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTableScalar = (value: unknown): value is TableScalar =>
  typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';

const isValidWriteOp = (op: unknown): op is WriteOp => {
  if (!isRecord(op) || typeof op.path !== 'string' || typeof op.baseVersion !== 'number')
    return false;

  if (op.op === 'set') return isTableScalar(op.value);

  return op.op === 'del';
};

export class SharedTableSession implements Destroyable {
  private readonly _transport: SessionTransport;
  private readonly _isHost: boolean;
  // Host-enforced per-path access control; allow-all when unconfigured.
  private readonly _permissions: NetPermissions;

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
  // `before` is the last-good baseline captured when the path first went in
  // flight, carried through so a later nack rolls back to it rather than to the
  // coalesced prediction it would otherwise re-capture.
  private readonly _deferredWrites = new Map<string, DeferredWrite>();
  private _reqCounter = 0;

  private readonly _changeSubs: { regex: RegExp; cb: TableChangeListener }[] = [];
  private readonly _eventSubs = new Map<string, Set<TableEventListener>>();
  private readonly _errorSubs = new Set<(path: string, reason: string) => void>();
  private readonly _peerSubs = new Map<PeerEvent, Set<(userId: UserId) => void>>();
  private readonly _endedSubs = new Set<() => void>();

  // Host-internal lock grant order (carries the reqId/callback to wake a waiter).
  // The authoritative lock owner and queue contents themselves live in `_store`
  // under each object's reserved branch (see OBJECT_MARK); only the grant queue,
  // which never needs to replicate, is kept here.
  private readonly _lockWaiters = new Map<string, LockWaiter[]>();
  private readonly _pendingLocks = new Map<string, () => void>();
  private readonly _pendingPops = new Map<string, (value: unknown) => void>();

  constructor(transport: SessionTransport, permissions: NetPermissions = ALLOW_ALL) {
    this._transport = transport;
    this._isHost = transport.role === 'host';
    this._permissions = permissions;
    this._snapshotApplied = this._isHost;

    // The host is authoritative: it only accepts client input through the
    // permission-checked request path, never raw state/response frames (a peer
    // could otherwise send a patch/snapshot to bypass canClientWrite). Slaves
    // only consume state/response and never handle requests.
    if (this._isHost)
      transport.on('request', (from, data) => {
        this._onRequest(from, data as RequestPayload);
      });
    else {
      transport.on('state', (data) => {
        this._onState(data as StatePayload);
      });
      transport.on('response', (data) => {
        this._onResponse(data as ResponsePayload);
      });
    }

    transport.on('peerJoined', (userId) => {
      this._onPeerJoined(userId);
    });
    transport.on('peerLeft', (userId) => {
      this._onPeerLeft(userId);
    });
    transport.on('ended', () => {
      this._endedSubs.forEach((cb) => {
        cb();
      });
    });
  }

  destroy(): void {
    this._transport.destroy();
    this._changeSubs.length = 0;
    this._eventSubs.clear();
    this._errorSubs.clear();
    this._peerSubs.clear();
    this._endedSubs.clear();
    this._lockWaiters.clear();
    this._pendingLocks.clear();
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
    const prefix = path === '' ? '' : path + '.';

    for (const key of this._store.keys()) {
      if (key !== path && key.startsWith(prefix)) return true;
    }

    return false;
  }

  childKeys(path: string): string[] {
    const prefix = path === '' ? '' : path + '.';
    const children = new Set<string>();

    for (const key of this._store.keys()) {
      if (path !== '' && !key.startsWith(prefix)) continue;

      const rest = key.slice(prefix.length);
      if (rest.length === 0) continue;

      const dot = rest.indexOf('.');
      const child = dot === -1 ? rest : rest.slice(0, dot);

      // Never surface an object's internal branch as a user-visible key.
      if (child === OBJECT_MARK) continue;

      children.add(child);
    }

    return [...children];
  }

  // The kind of net.state object declared at `path`, or undefined if the path
  // holds a plain value / branch / nothing. Backed by the reserved type marker.
  objectKindAt(path: string): 'lock' | 'queue' | undefined {
    const type = this.getValue(path + TYPE_SUFFIX);
    return type === 'lock' || type === 'queue' ? type : undefined;
  }

  // Assign a lock/queue object into net.state at `path`. Clears whatever the path
  // held before (scalar, branch, or a different object), then plants the type
  // marker. Runs the same code on host and client: the host writes directly, a
  // client's writes flow through the permission-checked request path, so a
  // forbidden declare is nacked and rolled back like any other write.
  declareObject(path: string, kind: 'lock' | 'queue'): void {
    const typeKey = path + TYPE_SUFFIX;
    // Keep the type slot so re-declaring an existing object overwrites it in
    // place (matching base versions) instead of delete-then-recreate, which
    // would self-conflict on a client.
    this._deletePaths(this._descendants(path).filter((p) => p !== typeKey));
    this.setValue(typeKey, kind);
  }

  setValue(path: string, value: TableScalar): void {
    if (this._isHost) {
      this._hostSet(path, value);
      return;
    }

    const existing = this._store.get(path);
    const baseVersion = existing?.version ?? 0;

    // A path with an in-flight write can't be re-sent yet (its server version
    // isn't settled). Coalesce to the latest value locally and send it once the
    // ack lands, so a client can stream an owned value (e.g. its paddle) every
    // frame without self-conflicting. Preserve the baseline from the first
    // coalesced write so a nack rolls back past every prediction.
    if (this._inflightPaths.has(path)) {
      const before = this._deferredWrites.get(path)?.before ?? existing;
      this._writeEntry(path, value, baseVersion);
      this._deferredWrites.set(path, { op: 'set', value, before });
      return;
    }

    this._captureBefore(path);
    this._writeEntry(path, value, baseVersion);
    this._pendingWrite.push({ path, op: 'set', value, baseVersion });
    this._scheduleFlush();
  }

  deleteSubtree(path: string): void {
    this._deletePaths(this._descendants(path));
  }

  private _deletePaths(paths: string[]): void {
    if (this._isHost) {
      for (const p of paths) this._hostDelete(p);
      return;
    }

    for (const p of paths) {
      const existing = this._store.get(p);
      const baseVersion = existing?.version ?? 0;

      // Same coalescing as setValue: defer a delete for a path still in flight,
      // preserving the baseline captured when it first went in flight.
      if (this._inflightPaths.has(p)) {
        const before = this._deferredWrites.get(p)?.before ?? existing;
        this._removeEntry(p);
        this._deferredWrites.set(p, { op: 'del', before });
        continue;
      }

      this._captureBefore(p);
      this._removeEntry(p);
      this._pendingWrite.push({ path: p, op: 'del', baseVersion });
    }

    this._scheduleFlush();
  }

  emit(name: string, payload: unknown): void {
    if (this._isHost) {
      this._transport.broadcastState({
        kind: 'event',
        name,
        from: this._transport.selfUserId,
        payload,
      });
      return;
    }

    this._transport.sendRequest({ kind: 'event', name, payload });
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
    this._transport.sendRequest({ kind: 'lock', reqId, path, action: 'acquire' });
  }

  releaseLock(path: string): void {
    if (this._isHost) {
      this._hostRelease(this._transport.selfUserId, path);
      return;
    }

    this._transport.sendRequest({ kind: 'lock', reqId: '', path, action: 'release' });
  }

  queuePush(path: string, value: unknown): void {
    if (this._isHost) {
      this._enqueue(path, value);
      return;
    }

    this._transport.sendRequest({ kind: 'queue', reqId: '', path, op: 'push', value });
  }

  queuePop(path: string, onResult: (value: unknown) => void): void {
    if (this._isHost) {
      onResult(this._dequeue(path));
      return;
    }

    const reqId = `${this._transport.selfUserId}-pop-${this._reqCounter++}`;
    this._pendingPops.set(reqId, onResult);
    this._transport.sendRequest({ kind: 'queue', reqId, path, op: 'pop' });
  }

  isLocked(path: string): boolean {
    return this._lockOwnerOf(path) !== null;
  }

  /** Round-trip time to a peer in ms, or null when the transport cannot measure it yet. */
  peerPing(userId: UserId): number | null {
    return this._transport.pingTo?.(userId) ?? null;
  }

  queueLength(path: string): number {
    return this._queueArray(path).length;
  }

  queuePeek(path: string): unknown {
    return this._queueArray(path)[0];
  }

  private _captureBefore(path: string): void {
    if (!this._pendingBefore.has(path)) this._pendingBefore.set(path, this._store.get(path));
  }

  // Re-queue writes coalesced while their path was in flight, now that the ack
  // has settled the base version. The latest value is already applied locally.
  private _flushDeferred(paths: string[], ackedVersions?: Map<string, number>): void {
    let queued = false;

    for (const path of paths) {
      const deferred = this._deferredWrites.get(path);
      if (!deferred) continue;

      this._deferredWrites.delete(path);
      // A deferred delete removed the local entry, so read the settled version
      // from the ack instead of the (now absent) store entry.
      const baseVersion = this._store.get(path)?.version ?? ackedVersions?.get(path) ?? 0;
      // Carry the baseline captured at coalesce time so a nack on this deferred
      // write rolls back to the last good value, not the prediction it replaced.
      this._pendingBefore.set(path, deferred.before);

      if (deferred.op === 'set')
        this._pendingWrite.push({ path, op: 'set', value: deferred.value, baseVersion });
      else this._pendingWrite.push({ path, op: 'del', baseVersion });

      queued = true;
    }

    if (queued) this._scheduleFlush();
  }

  private _hostSet(path: string, value: TableScalar): void {
    const version = (this._store.get(path)?.version ?? 0) + 1;
    this._writeEntry(path, value, version);
    this._pendingPatch.push({ path, op: 'set', value, version });
    this._scheduleFlush();
  }

  private _hostDelete(path: string): void {
    const version = (this._store.get(path)?.version ?? 0) + 1;
    this._removeEntry(path);
    this._pendingPatch.push({ path, op: 'del', version });
    this._scheduleFlush();
  }

  private _scheduleFlush(): void {
    if (this._flushScheduled) return;

    this._flushScheduled = true;
    queueMicrotask(() => {
      this._flush();
    });
  }

  private _flush(): void {
    this._flushScheduled = false;

    if (this._isHost) {
      if (this._pendingPatch.length === 0) return;

      // Privacy: withhold server-private paths from clients. The host keeps them
      // in its own store; they're simply never broadcast. A lock/queue object's
      // reserved keys inherit the read permission of the object's own path.
      const ops = this._pendingPatch.filter((op) =>
        this._permissions.canClientRead(ownerPathOf(op.path)),
      );
      this._pendingPatch.length = 0;

      if (ops.length > 0) this._transport.broadcastState({ kind: 'patch', ops });
      return;
    }

    if (this._pendingWrite.length === 0) return;

    const reqId = `${this._transport.selfUserId}-${this._reqCounter++}`;
    const ops = [...this._pendingWrite];
    this._pendingWrite.length = 0;

    const paths = [...new Set(ops.map((op) => op.path))];
    const previous = this._pendingBefore;
    this._pendingBefore = new Map();

    for (const p of paths) this._inflightPaths.add(p);

    this._inflight.set(reqId, { paths, previous });
    this._transport.sendRequest({ kind: 'write', reqId, ops });
  }

  private _onState(payload: StatePayload): void {
    if (!isRecord(payload)) return;

    // Hold live state until the baseline snapshot has been applied (slave only),
    // then replay it in arrival order on top of the snapshot.
    if (!this._snapshotApplied) {
      this._bufferedState.push(payload);
      return;
    }

    if (payload.kind === 'patch') {
      if (!Array.isArray(payload.ops)) return;

      for (const op of payload.ops) {
        if (!isRecord(op) || typeof op.path !== 'string') continue;

        // Skip the host's echo of a value we're still driving: a path with an
        // in-flight or coalesced local write holds a newer prediction, and
        // applying the stale echo would snap it back (a visible stutter). The
        // version reconciles on the write-ack instead.
        if (this._inflightPaths.has(op.path) || this._deferredWrites.has(op.path)) continue;

        if (op.op === 'set') {
          if (isTableScalar(op.value) && typeof op.version === 'number')
            this._writeEntry(op.path, op.value, op.version);
        } else if (op.op === 'del') {
          this._removeEntry(op.path);
        }
      }
      return;
    }

    if (payload.kind === 'event') this._dispatchEvent(payload.name, payload.from, payload.payload);
  }

  private _onRequest(from: UserId, payload: RequestPayload): void {
    if (!isRecord(payload)) return;

    if (payload.kind === 'event') {
      this._transport.broadcastState({
        kind: 'event',
        name: payload.name,
        from,
        payload: payload.payload,
      });
      this._dispatchEvent(payload.name, from, payload.payload);
      return;
    }

    if (payload.kind === 'lock') {
      if (typeof payload.path !== 'string') return;

      // An object lives at a net.state path, so it obeys that path's write
      // permission: a client that cannot write the path cannot lock it either
      // (if it can't write the value, it has nothing to protect). Silently drop
      // a forbidden acquire — the grant simply never comes.
      if (!this._permissions.canClientWrite(payload.path)) return;

      if (payload.action === 'acquire')
        this._hostAcquire(from, payload.path, payload.reqId, undefined);
      else this._hostRelease(from, payload.path);

      return;
    }

    if (payload.kind === 'queue') {
      if (typeof payload.path !== 'string') return;

      // Same authority as locks. A forbidden pop still needs a reply so the
      // caller's pending callback resolves (with nil, as if the queue were
      // empty) rather than dangling forever.
      if (!this._permissions.canClientWrite(payload.path)) {
        if (payload.op === 'pop')
          this._transport.respondTo(from, {
            kind: 'queue-result',
            reqId: payload.reqId,
            value: undefined,
          });
        return;
      }

      if (payload.op === 'push') this._enqueue(payload.path, payload.value);
      else
        this._transport.respondTo(from, {
          kind: 'queue-result',
          reqId: payload.reqId,
          value: this._dequeue(payload.path),
        });

      return;
    }

    if (payload.kind === 'write') this._handleWrite(from, payload);
  }

  private _handleWrite(from: UserId, payload: { reqId: string; ops: WriteOp[] }): void {
    // Untrusted peer input: drop a malformed frame rather than let a bad shape
    // throw (e.g. ops.filter on a non-array) or store a non-scalar value.
    if (
      typeof payload.reqId !== 'string' ||
      !Array.isArray(payload.ops) ||
      !payload.ops.every(isValidWriteOp)
    )
      return;

    // A client may set an object's reserved branch only to *declare* it (the type
    // marker, with a valid kind); the owner and queue contents are host-managed,
    // so forging them would bypass host ordering. Deletes are allowed — they ride
    // the ordinary subtree-delete path when a game clears a net.state slot.
    const forgedReserved = payload.ops.find(
      (op) =>
        isReserved(op.path) &&
        op.op === 'set' &&
        !(op.path.endsWith(TYPE_SUFFIX) && (op.value === 'lock' || op.value === 'queue')),
    );

    // Authority: a client may only write paths it is permitted to. An object's
    // reserved branch inherits the object's own net.state path permission. Reject
    // the whole request if any op is forbidden, so a partial write never lands.
    const forbidden = payload.ops.filter(
      (op) => !this._permissions.canClientWrite(ownerPathOf(op.path)),
    );

    if (forgedReserved || forbidden.length > 0) {
      const rejected = forgedReserved
        ? [{ path: forgedReserved.path, reason: 'forbidden' }]
        : forbidden.map((op) => ({ path: op.path, reason: 'forbidden' }));
      this._transport.respondTo(from, { kind: 'write-nack', reqId: payload.reqId, rejected });
      return;
    }

    const conflict = payload.ops.find(
      (op) => (this._store.get(op.path)?.version ?? 0) !== op.baseVersion,
    );

    if (conflict) {
      this._transport.respondTo(from, {
        kind: 'write-nack',
        reqId: payload.reqId,
        rejected: [{ path: conflict.path, reason: 'conflict' }],
      });
      return;
    }

    const results: { path: string; version: number }[] = [];

    for (const op of payload.ops) {
      if (op.op === 'set') this._hostSet(op.path, op.value);
      else this._hostDelete(op.path);

      results.push({ path: op.path, version: this._store.get(op.path)?.version ?? 0 });
    }

    this._transport.respondTo(from, { kind: 'write-ack', reqId: payload.reqId, results });
  }

  private _onResponse(payload: ResponsePayload): void {
    if (!isRecord(payload)) return;

    if (payload.kind === 'snapshot') {
      if (!Array.isArray(payload.entries)) return;

      for (const entry of payload.entries) {
        if (
          isRecord(entry) &&
          typeof entry.path === 'string' &&
          isTableScalar(entry.value) &&
          typeof entry.version === 'number'
        )
          this._writeEntry(entry.path, entry.value, entry.version);
      }

      // Baseline is in place: apply anything that arrived while we were waiting,
      // in order, so later host writes win over the snapshot.
      this._snapshotApplied = true;
      const buffered = this._bufferedState.splice(0);
      for (const state of buffered) this._onState(state);

      return;
    }

    if (payload.kind === 'lock-grant') {
      const grant = this._pendingLocks.get(payload.reqId);

      if (grant) {
        this._pendingLocks.delete(payload.reqId);
        grant();
      }

      return;
    }

    if (payload.kind === 'queue-result') {
      const onResult = this._pendingPops.get(payload.reqId);

      if (onResult) {
        this._pendingPops.delete(payload.reqId);
        onResult(payload.value);
      }

      return;
    }

    const inflight = this._inflight.get(payload.reqId);

    if (!inflight) return;

    this._inflight.delete(payload.reqId);
    for (const p of inflight.paths) this._inflightPaths.delete(p);

    if (payload.kind === 'write-ack') {
      // Capture the settled version for every acked path, even ones whose local
      // entry was removed by a coalesced delete — a deferred delete needs it as
      // its baseVersion or the host nacks it and resurrects the deleted value.
      const ackedVersions = new Map<string, number>();

      if (Array.isArray(payload.results)) {
        for (const result of payload.results) {
          if (
            !isRecord(result) ||
            typeof result.path !== 'string' ||
            typeof result.version !== 'number'
          )
            continue;

          ackedVersions.set(result.path, result.version);
          const entry = this._store.get(result.path);
          if (entry) entry.version = result.version;
        }
      }
      // The version is now settled; flush any value coalesced while in flight.
      this._flushDeferred(inflight.paths, ackedVersions);
      return;
    }

    for (const p of inflight.paths) {
      // A rejected write invalidates any follow-up we were holding for it.
      this._deferredWrites.delete(p);

      const before = inflight.previous.get(p);

      if (before === undefined) this._removeEntry(p);
      else this._writeEntry(p, before.value, before.version);
    }

    if (Array.isArray(payload.rejected)) {
      for (const rejected of payload.rejected) {
        if (!isRecord(rejected) || typeof rejected.path !== 'string') continue;

        const reason = typeof rejected.reason === 'string' ? rejected.reason : 'conflict';
        this._errorSubs.forEach((cb) => {
          cb(rejected.path, reason);
        });
      }
    }
  }

  private _onPeerJoined(userId: UserId): void {
    this._sendSnapshot(userId);
    this._dispatchPeer('joined', userId);
  }

  private _onPeerLeft(userId: UserId): void {
    // Free any lock the departing peer still held. Owners live at each lock's
    // reserved owner key in the store; find the ones this peer owned.
    const owned: string[] = [];
    for (const [key, entry] of this._store) {
      if (key.endsWith(OWNER_SUFFIX) && entry.value === userId)
        owned.push(key.slice(0, key.length - OWNER_SUFFIX.length));
    }
    for (const path of owned) this._hostRelease(userId, path);

    for (const [path, waiters] of this._lockWaiters)
      this._lockWaiters.set(
        path,
        waiters.filter((waiter) => waiter.userId !== userId),
      );

    this._dispatchPeer('left', userId);
  }

  private _dispatchPeer(event: PeerEvent, userId: UserId): void {
    this._peerSubs.get(event)?.forEach((cb) => {
      cb(userId);
    });
  }

  private _hostAcquire(
    userId: UserId,
    path: string,
    reqId: string | undefined,
    grant: (() => void) | undefined,
  ): void {
    if (this._lockOwnerOf(path) === null) {
      this._hostSet(path + OWNER_SUFFIX, userId);
      this._grantLock(userId, reqId, grant);
      return;
    }

    const waiters = this._lockWaiters.get(path) ?? [];
    waiters.push({ userId, reqId, grant });
    this._lockWaiters.set(path, waiters);
  }

  private _hostRelease(userId: UserId, path: string): void {
    if (this._lockOwnerOf(path) !== userId) return;

    const next = this._lockWaiters.get(path)?.shift();

    if (next) {
      this._hostSet(path + OWNER_SUFFIX, next.userId);
      this._grantLock(next.userId, next.reqId, next.grant);
    } else {
      this._hostDelete(path + OWNER_SUFFIX);
    }
  }

  private _grantLock(
    userId: UserId,
    reqId: string | undefined,
    grant: (() => void) | undefined,
  ): void {
    if (userId === this._transport.selfUserId) grant?.();
    else if (reqId !== undefined) this._transport.respondTo(userId, { kind: 'lock-grant', reqId });
  }

  private _lockOwnerOf(path: string): UserId | null {
    const owner = this.getValue(path + OWNER_SUFFIX);
    return typeof owner === 'number' ? owner : null;
  }

  private _enqueue(path: string, value: unknown): void {
    this._hostSet(path + QUEUE_SUFFIX, JSON.stringify([...this._queueArray(path), value]));
  }

  private _dequeue(path: string): unknown {
    const queue = this._queueArray(path);

    if (queue.length === 0) return undefined;

    const [head, ...rest] = queue;
    if (rest.length === 0) this._hostDelete(path + QUEUE_SUFFIX);
    else this._hostSet(path + QUEUE_SUFFIX, JSON.stringify(rest));

    return head;
  }

  // Queue contents ride net.state as a JSON string under the reserved queue key:
  // items may be nested tables, and one opaque scalar keeps that shape intact
  // through the ordinary patch/snapshot path without flattening each element.
  private _queueArray(path: string): unknown[] {
    const raw = this.getValue(path + QUEUE_SUFFIX);
    if (typeof raw !== 'string') return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private _sendSnapshot(userId: UserId): void {
    const entries = [...this._store.entries()]
      .filter(([path]) => this._permissions.canClientRead(ownerPathOf(path)))
      .map(([path, entry]) => ({
        path,
        value: entry.value,
        version: entry.version,
      }));

    this._transport.respondTo(userId, { kind: 'snapshot', entries });
  }

  private _writeEntry(path: string, value: TableScalar, version: number): void {
    const previous = this._store.get(path);
    this._store.set(path, { value, version });
    this._fireChange(path, value, previous?.value);
  }

  private _removeEntry(path: string): void {
    const previous = this._store.get(path);

    if (previous === undefined) return;

    this._store.delete(path);
    this._fireChange(path, undefined, previous.value);
  }

  private _descendants(path: string): string[] {
    const prefix = path + '.';
    const paths: string[] = [];

    for (const key of this._store.keys()) {
      if (key === path || key.startsWith(prefix)) paths.push(key);
    }

    return paths;
  }

  private _fireChange(
    path: string,
    newValue: TableScalar | undefined,
    oldValue: TableScalar | undefined,
  ): void {
    if (newValue === oldValue) return;

    // An object's reserved backing (lock owner, queue contents) is not net.state
    // data, so its churn must not fire the game's net.on(path) change listeners.
    if (isReserved(path)) return;

    for (const sub of this._changeSubs) {
      if (sub.regex.test(path)) sub.cb(path, newValue, oldValue);
    }
  }

  private _dispatchEvent(name: string, from: UserId, payload: unknown): void {
    if (from === this._transport.selfUserId) return;

    this._eventSubs.get(name)?.forEach((cb) => {
      cb(from, payload);
    });
  }
}
