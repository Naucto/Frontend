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

// The net.state path a store key belongs to: the object's own path for a reserved key.
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
  | { kind: 'reject'; path: string; reason: 'forbidden'; reqId?: string }
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

// Peer frames bypass the backend's validation, so their shape is checked before use.
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
  private readonly _permissions: NetPermissions;

  private readonly _store = new Map<string, TableEntry>();

  // A slave buffers live state until the host's snapshot is applied, so the game never reads a
  // half-replicated table.
  private _snapshotApplied: boolean;
  private readonly _bufferedState: StatePayload[] = [];

  private readonly _pendingPatch: PatchOp[] = [];
  private readonly _pendingWrite: WriteOp[] = [];
  private _pendingBefore = new Map<string, TableEntry | undefined>();
  private _flushScheduled = false;

  private readonly _inflight = new Map<string, InflightWrite>();
  private readonly _inflightPaths = new Set<string>();
  /** Latest write per in-flight path, sent on ack; `before` is the value a nack rolls back to. */
  private readonly _deferredWrites = new Map<string, DeferredWrite>();
  private _reqCounter = 0;

  private readonly _changeSubs: { regex: RegExp; cb: TableChangeListener }[] = [];
  private readonly _eventSubs = new Map<string, Set<TableEventListener>>();
  private readonly _errorSubs = new Set<(path: string, reason: string) => void>();
  private readonly _peerSubs = new Map<PeerEvent, Set<(userId: UserId) => void>>();
  private readonly _endedSubs = new Set<() => void>();
  private readonly _closedSubs = new Set<() => void>();

  // Host-only grant queue; lock owners and queue contents live in `_store` and replicate.
  private readonly _lockWaiters = new Map<string, LockWaiter[]>();
  private readonly _pendingLocks = new Map<string, () => void>();
  private readonly _pendingPops = new Map<string, (value: unknown) => void>();
  // The queue string is parsed once per distinct value, not once per read: a game polls length
  // and head every frame, and the string only changes when something is pushed or popped.
  private readonly _queueCache = new Map<string, { raw: string; items: unknown[] }>();

  constructor(transport: SessionTransport, permissions: NetPermissions = ALLOW_ALL) {
    this._transport = transport;
    this._isHost = transport.role === 'host';
    this._permissions = permissions;
    this._snapshotApplied = this._isHost;

    // The host takes client input only as permission-checked requests; slaves take only state and
    // responses.
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
    transport.on('peerRejoined', (userId) => {
      this._sendSnapshot(userId);
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
    this._closedSubs.forEach((cb) => {
      cb();
    });
    this._transport.destroy();
    this._changeSubs.length = 0;
    this._eventSubs.clear();
    this._errorSubs.clear();
    this._peerSubs.clear();
    this._endedSubs.clear();
    this._closedSubs.clear();
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

  /**
   * Replaces whatever `path` held with a lock or queue; a client's declare is permission-checked
   * like any write.
   */
  declareObject(path: string, kind: 'lock' | 'queue'): void {
    const typeKey = path + TYPE_SUFFIX;
    // The type slot is overwritten in place so a client's re-declare keeps a matching base version.
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

    // An in-flight path is coalesced locally and re-sent on ack, keeping the first baseline for a
    // nack.
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

  // Flushes pending writes first so the host applies them before this request.
  private _sendOrdered(request: RequestPayload): void {
    this._flush();
    this._transport.sendRequest(request);
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

    this._sendOrdered({ kind: 'event', name, payload });
  }

  onChange(pattern: string, cb: TableChangeListener): () => void {
    const sub = { regex: compilePattern(pattern), cb };
    this._changeSubs.push(sub);

    return () => {
      const at = this._changeSubs.indexOf(sub);
      if (at !== -1) this._changeSubs.splice(at, 1);
    };
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

  /**
   * Fires when this session object is destroyed (engine restart or reload), unlike `onEnded`; not
   * for game handlers, whose VM is closing.
   */
  onClosed(cb: () => void): void {
    this._closedSubs.add(cb);
  }

  acquireLock(path: string, onGranted: () => void): void {
    if (this._isHost) {
      this._hostAcquire(this._transport.selfUserId, path, undefined, onGranted);
      return;
    }

    const reqId = `${this._transport.selfUserId}-lock-${this._reqCounter++}`;
    this._pendingLocks.set(reqId, onGranted);
    this._sendOrdered({ kind: 'lock', reqId, path, action: 'acquire' });
  }

  releaseLock(path: string): void {
    if (this._isHost) {
      this._hostRelease(this._transport.selfUserId, path);
      return;
    }

    this._sendOrdered({ kind: 'lock', reqId: '', path, action: 'release' });
  }

  queuePush(path: string, value: unknown): void {
    if (this._isHost) {
      this._enqueue(path, value);
      return;
    }

    this._sendOrdered({ kind: 'queue', reqId: '', path, op: 'push', value });
  }

  queuePop(path: string, onResult: (value: unknown) => void): void {
    if (this._isHost) {
      onResult(this._dequeue(path));
      return;
    }

    const reqId = `${this._transport.selfUserId}-pop-${this._reqCounter++}`;
    this._pendingPops.set(reqId, onResult);
    this._sendOrdered({ kind: 'queue', reqId, path, op: 'pop' });
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

    // An owner cleared by a re-declare or a delete rather than a release: once the operation that
    // did it has finished, the head waiter takes a lock still standing, and a lock gone takes none.
    if (!path.endsWith(OWNER_SUFFIX)) return;
    const lockPath = path.slice(0, -OWNER_SUFFIX.length);
    if (!this._lockWaiters.get(lockPath)?.length) return;
    queueMicrotask(() => {
      if (this._lockOwnerOf(lockPath) !== null) return;
      if (this.objectKindAt(lockPath) !== 'lock') {
        this._lockWaiters.delete(lockPath);
        return;
      }
      const next = this._lockWaiters.get(lockPath)?.shift();
      if (!next) return;
      this._hostSet(path, next.userId);
      this._grantLock(next.userId, next.reqId, next.grant);
    });
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

      // Client-unreadable paths are never broadcast; reserved keys inherit their object's read
      // permission.
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

    if (!this._snapshotApplied) {
      this._bufferedState.push(payload);
      return;
    }

    if (payload.kind === 'patch') {
      if (!Array.isArray(payload.ops)) return;

      for (const op of payload.ops) {
        if (!isRecord(op) || typeof op.path !== 'string') continue;

        // A path with a local write outstanding keeps its prediction, and the host's value becomes
        // what a nack rolls back to; the ack reconciles the version.
        const deferred = this._deferredWrites.get(op.path);
        if (this._inflightPaths.has(op.path) || deferred || this._pendingBefore.has(op.path)) {
          let host: TableEntry | undefined | null = null;
          if (op.op === 'del') host = undefined;
          else if (op.op === 'set' && isTableScalar(op.value) && typeof op.version === 'number')
            host = { value: op.value, version: op.version };
          if (host === null) continue;

          if (this._pendingBefore.has(op.path)) this._pendingBefore.set(op.path, host);
          if (deferred) deferred.before = host;
          for (const write of this._inflight.values())
            if (write.previous.has(op.path)) write.previous.set(op.path, host);
          continue;
        }

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
      // Broadcast pending patches first so peers see the state before the event about it.
      this._flush();
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

      // A lock obeys its path's write permission; a refused acquire is answered so the guest drops
      // its callback.
      if (!this._permissions.canClientWrite(payload.path)) {
        if (payload.action === 'acquire')
          this._transport.respondTo(from, {
            kind: 'reject',
            path: payload.path,
            reason: 'forbidden',
            reqId: payload.reqId,
          });
        return;
      }

      if (payload.action === 'acquire')
        this._hostAcquire(from, payload.path, payload.reqId, undefined);
      else this._hostRelease(from, payload.path);

      return;
    }

    if (payload.kind === 'queue') {
      if (typeof payload.path !== 'string') return;

      // Same authority as locks. The guest resolves a refused pop with nil
      // itself, so the game code waiting on it does not hang.
      if (!this._permissions.canClientWrite(payload.path)) {
        this._transport.respondTo(from, {
          kind: 'reject',
          path: payload.path,
          reason: 'forbidden',
          reqId: payload.op === 'pop' ? payload.reqId : undefined,
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

    // A client may set only an object's type marker in its reserved branch; owner and contents are
    // host-managed.
    const forgedReserved = payload.ops.find(
      (op) =>
        isReserved(op.path) &&
        op.op === 'set' &&
        !(op.path.endsWith(TYPE_SUFFIX) && (op.value === 'lock' || op.value === 'queue')),
    );

    // One forbidden op rejects the whole request; reserved keys inherit their object's permission.
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

      // A later snapshot heals a gap in the patches, so what it no longer holds is gone, unless
      // a local write is still outstanding on it.
      if (this._snapshotApplied) {
        const held = new Set(
          payload.entries.map((entry) =>
            isRecord(entry) && typeof entry.path === 'string' ? entry.path : '',
          ),
        );
        for (const path of [...this._store.keys()])
          if (
            !held.has(path) &&
            !this._inflightPaths.has(path) &&
            !this._deferredWrites.has(path) &&
            !this._pendingBefore.has(path)
          )
            this._removeEntry(path);
      }

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

    if (payload.kind === 'reject') {
      if (typeof payload.path !== 'string') return;

      // A refused acquire never runs its callback; a refused pop resolves with
      // nil, as on an empty queue, so game code waiting on it does not hang.
      if (typeof payload.reqId === 'string') {
        this._pendingLocks.delete(payload.reqId);
        const onResult = this._pendingPops.get(payload.reqId);

        if (onResult) {
          this._pendingPops.delete(payload.reqId);
          onResult(undefined);
        }
      }

      const path = payload.path;
      this._errorSubs.forEach((cb) => {
        cb(path, 'forbidden');
      });

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
      // Kept for paths a deferred delete already removed locally: it is their base version.
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
    // Free any lock the departing peer still held.
    const owned: string[] = [];
    for (const [key, entry] of this._store) {
      if (key.endsWith(OWNER_SUFFIX) && entry.value === userId)
        owned.push(key.slice(0, key.length - OWNER_SUFFIX.length));
    }
    for (const [path, waiters] of this._lockWaiters)
      this._lockWaiters.set(
        path,
        waiters.filter((waiter) => waiter.userId !== userId),
      );
    for (const path of owned) this._hostRelease(userId, path);

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
    else if (reqId !== undefined) {
      this._flush();
      this._transport.respondTo(userId, { kind: 'lock-grant', reqId });
    }
  }

  /** Who holds the lock at `path` (editor tooling). */
  lockOwner(path: string): UserId | null {
    return this._lockOwnerOf(path);
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

    const cached = this._queueCache.get(path);
    if (cached?.raw === raw) return cached.items;

    let items: unknown[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      /* Not a queue; reads as an empty one. */
    }
    this._queueCache.set(path, { raw, items });
    return items;
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

    for (const sub of [...this._changeSubs]) {
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
