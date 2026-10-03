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
    const char = pattern[i]!;

    if (char === '*' && pattern[i + 1] === '*') {
      out += '.*';
      i++;
    } else if (char === '*') {
      out += '[^.]+';
    } else if (/[.+?^${}()|[\]\\]/.test(char)) {
      out += '\\' + char;
    } else {
      out += char;
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
  if (!isRecord(op) || typeof op.path !== 'string' || typeof op.baseVersion !== 'number') {
    return false;
  }

  if (op.op === 'set') {
    return isTableScalar(op.value);
  }

  return op.op === 'del';
};

export class SharedTableSession implements Destroyable {
  private readonly transport: SessionTransport;
  private readonly hosting: boolean;
  private readonly permissions: NetPermissions;

  private readonly store = new Map<string, TableEntry>();

  // A slave buffers live state until the host's snapshot is applied, so the game never reads a
  // half-replicated table.
  private snapshotApplied: boolean;
  private readonly bufferedState: StatePayload[] = [];

  private readonly pendingPatch: PatchOp[] = [];
  private readonly pendingWrite: WriteOp[] = [];
  private pendingBefore = new Map<string, TableEntry | undefined>();
  private flushScheduled = false;

  private readonly inflight = new Map<string, InflightWrite>();
  private readonly inflightPaths = new Set<string>();
  /** Latest write per in-flight path, sent on ack; `before` is the value a nack rolls back to. */
  private readonly deferredWrites = new Map<string, DeferredWrite>();
  private reqCounter = 0;

  private readonly changeSubs: { regex: RegExp; cb: TableChangeListener }[] = [];
  private readonly eventSubs = new Map<string, Set<TableEventListener>>();
  private readonly errorSubs = new Set<(path: string, reason: string) => void>();
  private readonly peerSubs = new Map<PeerEvent, Set<(userId: UserId) => void>>();
  private readonly endedSubs = new Set<() => void>();
  private readonly closedSubs = new Set<() => void>();

  // Host-only grant queue; lock owners and queue contents live in `store` and replicate.
  private readonly lockWaiters = new Map<string, LockWaiter[]>();
  private readonly pendingLocks = new Map<string, () => void>();
  private readonly pendingPops = new Map<string, (value: unknown) => void>();
  // The queue string is parsed once per distinct value, not once per read: a game polls length
  // and head every frame, and the string only changes when something is pushed or popped.
  private readonly queueCache = new Map<string, { raw: string; items: unknown[] }>();

  constructor(transport: SessionTransport, permissions: NetPermissions = ALLOW_ALL) {
    this.transport = transport;
    this.hosting = transport.role === 'host';
    this.permissions = permissions;
    this.snapshotApplied = this.hosting;

    // The host takes client input only as permission-checked requests; slaves take only state and
    // responses.
    if (this.hosting) {
      transport.on('request', (from, data) => {
        this.onRequest(from, data as RequestPayload);
      });
    } else {
      transport.on('state', (data) => {
        this.onState(data as StatePayload);
      });
      transport.on('response', (data) => {
        this.onResponse(data as ResponsePayload);
      });
    }

    transport.on('peerJoined', (userId) => {
      this.onPeerJoined(userId);
    });
    transport.on('peerRejoined', (userId) => {
      this.sendSnapshot(userId);
    });
    transport.on('peerLeft', (userId) => {
      this.onPeerLeft(userId);
    });
    transport.on('ended', () => {
      this.endedSubs.forEach((cb) => {
        cb();
      });
    });
  }

  destroy(): void {
    this.closedSubs.forEach((cb) => {
      cb();
    });
    this.transport.destroy();
    this.changeSubs.length = 0;
    this.eventSubs.clear();
    this.errorSubs.clear();
    this.peerSubs.clear();
    this.endedSubs.clear();
    this.closedSubs.clear();
    this.lockWaiters.clear();
    this.pendingLocks.clear();
    this.pendingPops.clear();
    this.store.clear();
    this.bufferedState.length = 0;
    this.deferredWrites.clear();
  }

  get isHost(): boolean {
    return this.hosting;
  }

  get selfUserId(): UserId {
    return this.transport.selfUserId;
  }

  getValue(path: string): TableScalar | undefined {
    return this.store.get(path)?.value;
  }

  isContainer(path: string): boolean {
    const prefix = path === '' ? '' : path + '.';

    for (const key of this.store.keys()) {
      if (key !== path && key.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  childKeys(path: string): string[] {
    const prefix = path === '' ? '' : path + '.';
    const children = new Set<string>();

    for (const key of this.store.keys()) {
      if (path !== '' && !key.startsWith(prefix)) {
        continue;
      }

      const rest = key.slice(prefix.length);
      if (rest.length === 0) {
        continue;
      }

      const dot = rest.indexOf('.');
      const child = dot === -1 ? rest : rest.slice(0, dot);

      // Never surface an object's internal branch as a user-visible key.
      if (child === OBJECT_MARK) {
        continue;
      }

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
    this.deletePaths(this.descendants(path).filter((descendant) => descendant !== typeKey));
    this.setValue(typeKey, kind);
  }

  setValue(path: string, value: TableScalar): void {
    if (this.hosting) {
      this.hostSet(path, value);
      return;
    }

    const existing = this.store.get(path);
    const baseVersion = existing?.version ?? 0;

    // An in-flight path is coalesced locally and re-sent on ack, keeping the first baseline for a
    // nack.
    if (this.inflightPaths.has(path)) {
      const before = this.deferredWrites.get(path)?.before ?? existing;
      this.writeEntry(path, value, baseVersion);
      this.deferredWrites.set(path, { op: 'set', value, before });
      return;
    }

    this.captureBefore(path);
    this.writeEntry(path, value, baseVersion);
    this.pendingWrite.push({ path, op: 'set', value, baseVersion });
    this.scheduleFlush();
  }

  deleteSubtree(path: string): void {
    this.deletePaths(this.descendants(path));
  }

  private deletePaths(paths: string[]): void {
    if (this.hosting) {
      for (const path of paths) {
        this.hostDelete(path);
      }
      return;
    }

    for (const path of paths) {
      const existing = this.store.get(path);
      const baseVersion = existing?.version ?? 0;

      // Same coalescing as setValue: defer a delete for a path still in flight,
      // preserving the baseline captured when it first went in flight.
      if (this.inflightPaths.has(path)) {
        const before = this.deferredWrites.get(path)?.before ?? existing;
        this.removeEntry(path);
        this.deferredWrites.set(path, { op: 'del', before });
        continue;
      }

      this.captureBefore(path);
      this.removeEntry(path);
      this.pendingWrite.push({ path, op: 'del', baseVersion });
    }

    this.scheduleFlush();
  }

  // Flushes pending writes first so the host applies them before this request.
  private sendOrdered(request: RequestPayload): void {
    this.flush();
    this.transport.sendRequest(request);
  }

  emit(name: string, payload: unknown): void {
    if (this.hosting) {
      this.transport.broadcastState({
        kind: 'event',
        name,
        from: this.transport.selfUserId,
        payload,
      });
      return;
    }

    this.sendOrdered({ kind: 'event', name, payload });
  }

  onChange(pattern: string, cb: TableChangeListener): () => void {
    const sub = { regex: compilePattern(pattern), cb };
    this.changeSubs.push(sub);

    return () => {
      const at = this.changeSubs.indexOf(sub);
      if (at !== -1) {
        this.changeSubs.splice(at, 1);
      }
    };
  }

  onEvent(name: string, cb: TableEventListener): void {
    const set = this.eventSubs.get(name) ?? new Set<TableEventListener>();
    set.add(cb);
    this.eventSubs.set(name, set);
  }

  onError(cb: (path: string, reason: string) => void): void {
    this.errorSubs.add(cb);
  }

  onPeer(event: PeerEvent, cb: (userId: UserId) => void): void {
    const set = this.peerSubs.get(event) ?? new Set<(userId: UserId) => void>();
    set.add(cb);
    this.peerSubs.set(event, set);
  }

  onEnded(cb: () => void): void {
    this.endedSubs.add(cb);
  }

  /**
   * Fires when this session object is destroyed (engine restart or reload), unlike `onEnded`; not
   * for game handlers, whose VM is closing.
   */
  onClosed(cb: () => void): void {
    this.closedSubs.add(cb);
  }

  acquireLock(path: string, onGranted: () => void): void {
    if (this.hosting) {
      this.hostAcquire(this.transport.selfUserId, path, undefined, onGranted);
      return;
    }

    const reqId = `${this.transport.selfUserId}-lock-${this.reqCounter++}`;
    this.pendingLocks.set(reqId, onGranted);
    this.sendOrdered({ kind: 'lock', reqId, path, action: 'acquire' });
  }

  releaseLock(path: string): void {
    if (this.hosting) {
      this.hostRelease(this.transport.selfUserId, path);
      return;
    }

    this.sendOrdered({ kind: 'lock', reqId: '', path, action: 'release' });
  }

  queuePush(path: string, value: unknown): void {
    if (this.hosting) {
      this.enqueue(path, value);
      return;
    }

    this.sendOrdered({ kind: 'queue', reqId: '', path, op: 'push', value });
  }

  queuePop(path: string, onResult: (value: unknown) => void): void {
    if (this.hosting) {
      onResult(this.dequeue(path));
      return;
    }

    const reqId = `${this.transport.selfUserId}-pop-${this.reqCounter++}`;
    this.pendingPops.set(reqId, onResult);
    this.sendOrdered({ kind: 'queue', reqId, path, op: 'pop' });
  }

  isLocked(path: string): boolean {
    return this.lockOwnerOf(path) !== null;
  }

  /** Round-trip time to a peer in ms, or null when the transport cannot measure it yet. */
  peerPing(userId: UserId): number | null {
    return this.transport.pingTo?.(userId) ?? null;
  }

  queueLength(path: string): number {
    return this.queueArray(path).length;
  }

  queuePeek(path: string): unknown {
    return this.queueArray(path)[0];
  }

  private captureBefore(path: string): void {
    if (!this.pendingBefore.has(path)) {
      this.pendingBefore.set(path, this.store.get(path));
    }
  }

  // Re-queue writes coalesced while their path was in flight, now that the ack
  // has settled the base version. The latest value is already applied locally.
  private flushDeferred(paths: string[], ackedVersions?: Map<string, number>): void {
    let queued = false;

    for (const path of paths) {
      const deferred = this.deferredWrites.get(path);
      if (!deferred) {
        continue;
      }

      this.deferredWrites.delete(path);
      // A deferred delete removed the local entry, so read the settled version
      // from the ack instead of the (now absent) store entry.
      const baseVersion = this.store.get(path)?.version ?? ackedVersions?.get(path) ?? 0;
      // Carry the baseline captured at coalesce time so a nack on this deferred
      // write rolls back to the last good value, not the prediction it replaced.
      this.pendingBefore.set(path, deferred.before);

      if (deferred.op === 'set') {
        this.pendingWrite.push({ path, op: 'set', value: deferred.value, baseVersion });
      } else {
        this.pendingWrite.push({ path, op: 'del', baseVersion });
      }

      queued = true;
    }

    if (queued) {
      this.scheduleFlush();
    }
  }

  private hostSet(path: string, value: TableScalar): void {
    const version = (this.store.get(path)?.version ?? 0) + 1;
    this.writeEntry(path, value, version);
    this.pendingPatch.push({ path, op: 'set', value, version });
    this.scheduleFlush();
  }

  private hostDelete(path: string): void {
    const version = (this.store.get(path)?.version ?? 0) + 1;
    this.removeEntry(path);
    this.pendingPatch.push({ path, op: 'del', version });
    this.scheduleFlush();

    // An owner cleared by a re-declare or a delete rather than a release: once the operation that
    // did it has finished, the head waiter takes a lock still standing, and a lock gone takes none.
    if (!path.endsWith(OWNER_SUFFIX)) {
      return;
    }
    const lockPath = path.slice(0, -OWNER_SUFFIX.length);
    if (!this.lockWaiters.get(lockPath)?.length) {
      return;
    }
    queueMicrotask(() => {
      if (this.lockOwnerOf(lockPath) !== null) {
        return;
      }
      if (this.objectKindAt(lockPath) !== 'lock') {
        this.lockWaiters.delete(lockPath);
        return;
      }
      const next = this.lockWaiters.get(lockPath)?.shift();
      if (!next) {
        return;
      }
      this.hostSet(path, next.userId);
      this.grantLock(next.userId, next.reqId, next.grant);
    });
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) {
      return;
    }

    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flush();
    });
  }

  private flush(): void {
    this.flushScheduled = false;

    if (this.hosting) {
      if (this.pendingPatch.length === 0) {
        return;
      }

      // Client-unreadable paths are never broadcast; reserved keys inherit their object's read
      // permission.
      const ops = this.pendingPatch.filter((op) =>
        this.permissions.canClientRead(ownerPathOf(op.path)),
      );
      this.pendingPatch.length = 0;

      if (ops.length > 0) {
        this.transport.broadcastState({ kind: 'patch', ops });
      }
      return;
    }

    if (this.pendingWrite.length === 0) {
      return;
    }

    const reqId = `${this.transport.selfUserId}-${this.reqCounter++}`;
    const ops = [...this.pendingWrite];
    this.pendingWrite.length = 0;

    const paths = [...new Set(ops.map((op) => op.path))];
    const previous = this.pendingBefore;
    this.pendingBefore = new Map();

    for (const path of paths) {
      this.inflightPaths.add(path);
    }

    this.inflight.set(reqId, { paths, previous });
    this.transport.sendRequest({ kind: 'write', reqId, ops });
  }

  private onState(payload: StatePayload): void {
    if (!isRecord(payload)) {
      return;
    }

    if (!this.snapshotApplied) {
      this.bufferedState.push(payload);
      return;
    }

    if (payload.kind === 'patch') {
      if (!Array.isArray(payload.ops)) {
        return;
      }

      for (const op of payload.ops) {
        if (!isRecord(op) || typeof op.path !== 'string') {
          continue;
        }

        // A path with a local write outstanding keeps its prediction, and the host's value becomes
        // what a nack rolls back to; the ack reconciles the version.
        const deferred = this.deferredWrites.get(op.path);
        if (this.inflightPaths.has(op.path) || deferred || this.pendingBefore.has(op.path)) {
          let host: TableEntry | undefined | null = null;
          if (op.op === 'del') {
            host = undefined;
          } else if (op.op === 'set' && isTableScalar(op.value) && typeof op.version === 'number') {
            host = { value: op.value, version: op.version };
          }
          if (host === null) {
            continue;
          }

          if (this.pendingBefore.has(op.path)) {
            this.pendingBefore.set(op.path, host);
          }
          if (deferred) {
            deferred.before = host;
          }
          for (const write of this.inflight.values()) {
            if (write.previous.has(op.path)) {
              write.previous.set(op.path, host);
            }
          }
          continue;
        }

        if (op.op === 'set') {
          if (isTableScalar(op.value) && typeof op.version === 'number') {
            this.writeEntry(op.path, op.value, op.version);
          }
        } else if (op.op === 'del') {
          this.removeEntry(op.path);
        }
      }
      return;
    }

    if (payload.kind === 'event') {
      this.dispatchEvent(payload.name, payload.from, payload.payload);
    }
  }

  private onRequest(from: UserId, payload: RequestPayload): void {
    if (!isRecord(payload)) {
      return;
    }

    if (payload.kind === 'event') {
      // Broadcast pending patches first so peers see the state before the event about it.
      this.flush();
      this.transport.broadcastState({
        kind: 'event',
        name: payload.name,
        from,
        payload: payload.payload,
      });
      this.dispatchEvent(payload.name, from, payload.payload);
      return;
    }

    if (payload.kind === 'lock') {
      if (typeof payload.path !== 'string') {
        return;
      }

      // A lock obeys its path's write permission; a refused acquire is answered so the guest drops
      // its callback.
      if (!this.permissions.canClientWrite(payload.path)) {
        if (payload.action === 'acquire') {
          this.transport.respondTo(from, {
            kind: 'reject',
            path: payload.path,
            reason: 'forbidden',
            reqId: payload.reqId,
          });
        }
        return;
      }

      if (payload.action === 'acquire') {
        this.hostAcquire(from, payload.path, payload.reqId, undefined);
      } else {
        this.hostRelease(from, payload.path);
      }

      return;
    }

    if (payload.kind === 'queue') {
      if (typeof payload.path !== 'string') {
        return;
      }

      // Same authority as locks. The guest resolves a refused pop with nil
      // itself, so the game code waiting on it does not hang.
      if (!this.permissions.canClientWrite(payload.path)) {
        this.transport.respondTo(from, {
          kind: 'reject',
          path: payload.path,
          reason: 'forbidden',
          reqId: payload.op === 'pop' ? payload.reqId : undefined,
        });
        return;
      }

      if (payload.op === 'push') {
        this.enqueue(payload.path, payload.value);
      } else {
        this.transport.respondTo(from, {
          kind: 'queue-result',
          reqId: payload.reqId,
          value: this.dequeue(payload.path),
        });
      }

      return;
    }

    if (payload.kind === 'write') {
      this.handleWrite(from, payload);
    }
  }

  private handleWrite(from: UserId, payload: { reqId: string; ops: WriteOp[] }): void {
    // Untrusted peer input: drop a malformed frame rather than let a bad shape
    // throw (e.g. ops.filter on a non-array) or store a non-scalar value.
    if (
      typeof payload.reqId !== 'string' ||
      !Array.isArray(payload.ops) ||
      !payload.ops.every(isValidWriteOp)
    ) {
      return;
    }

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
      (op) => !this.permissions.canClientWrite(ownerPathOf(op.path)),
    );

    if (forgedReserved || forbidden.length > 0) {
      const rejected = forgedReserved
        ? [{ path: forgedReserved.path, reason: 'forbidden' }]
        : forbidden.map((op) => ({ path: op.path, reason: 'forbidden' }));
      this.transport.respondTo(from, { kind: 'write-nack', reqId: payload.reqId, rejected });
      return;
    }

    const conflict = payload.ops.find(
      (op) => (this.store.get(op.path)?.version ?? 0) !== op.baseVersion,
    );

    if (conflict) {
      this.transport.respondTo(from, {
        kind: 'write-nack',
        reqId: payload.reqId,
        rejected: [{ path: conflict.path, reason: 'conflict' }],
      });
      return;
    }

    const results: { path: string; version: number }[] = [];

    for (const op of payload.ops) {
      if (op.op === 'set') {
        this.hostSet(op.path, op.value);
      } else {
        this.hostDelete(op.path);
      }

      results.push({ path: op.path, version: this.store.get(op.path)?.version ?? 0 });
    }

    this.transport.respondTo(from, { kind: 'write-ack', reqId: payload.reqId, results });
  }

  private onResponse(payload: ResponsePayload): void {
    if (!isRecord(payload)) {
      return;
    }

    switch (payload.kind) {
      case 'snapshot':
        this.onSnapshot(payload);
        break;
      case 'reject':
        this.onReject(payload);
        break;
      case 'lock-grant': {
        const grant = this.pendingLocks.get(payload.reqId);

        if (grant) {
          this.pendingLocks.delete(payload.reqId);
          grant();
        }
        break;
      }
      case 'queue-result': {
        const onResult = this.pendingPops.get(payload.reqId);

        if (onResult) {
          this.pendingPops.delete(payload.reqId);
          onResult(payload.value);
        }
        break;
      }
      case 'write-ack':
        this.onWriteAck(payload);
        break;
      case 'write-nack':
        this.onWriteNack(payload);
        break;
      default: {
        // A kind this build does not know is a peer's mistake, not ours to act on.
        const unknown: never = payload;
        void unknown;
      }
    }
  }

  private onSnapshot(payload: SnapshotPayload): void {
    if (!Array.isArray(payload.entries)) {
      return;
    }

    // A later snapshot heals a gap in the patches, so what it no longer holds is gone, unless
    // a local write is still outstanding on it.
    if (this.snapshotApplied) {
      const held = new Set(
        payload.entries.map((entry) =>
          isRecord(entry) && typeof entry.path === 'string' ? entry.path : '',
        ),
      );
      for (const path of [...this.store.keys()]) {
        if (
          !held.has(path) &&
          !this.inflightPaths.has(path) &&
          !this.deferredWrites.has(path) &&
          !this.pendingBefore.has(path)
        ) {
          this.removeEntry(path);
        }
      }
    }

    for (const entry of payload.entries) {
      if (
        isRecord(entry) &&
        typeof entry.path === 'string' &&
        isTableScalar(entry.value) &&
        typeof entry.version === 'number'
      ) {
        this.writeEntry(entry.path, entry.value, entry.version);
      }
    }

    // Baseline is in place: apply anything that arrived while we were waiting,
    // in order, so later host writes win over the snapshot.
    this.snapshotApplied = true;
    const buffered = this.bufferedState.splice(0);
    for (const state of buffered) {
      this.onState(state);
    }
  }

  private onReject(payload: Extract<ResponsePayload, { kind: 'reject' }>): void {
    if (typeof payload.path !== 'string') {
      return;
    }

    // A refused acquire never runs its callback; a refused pop resolves with
    // nil, as on an empty queue, so game code waiting on it does not hang.
    if (typeof payload.reqId === 'string') {
      this.pendingLocks.delete(payload.reqId);
      const onResult = this.pendingPops.get(payload.reqId);

      if (onResult) {
        this.pendingPops.delete(payload.reqId);
        onResult(undefined);
      }
    }

    const path = payload.path;
    this.errorSubs.forEach((cb) => {
      cb(path, 'forbidden');
    });
  }

  /** The write a response answers, no longer in flight; undefined when it answers none. */
  private settleInflight(reqId: string): InflightWrite | undefined {
    const inflight = this.inflight.get(reqId);

    if (!inflight) {
      return undefined;
    }

    this.inflight.delete(reqId);
    for (const path of inflight.paths) {
      this.inflightPaths.delete(path);
    }
    return inflight;
  }

  private onWriteAck(payload: Extract<ResponsePayload, { kind: 'write-ack' }>): void {
    const inflight = this.settleInflight(payload.reqId);

    if (!inflight) {
      return;
    }

    // Kept for paths a deferred delete already removed locally: it is their base version.
    const ackedVersions = new Map<string, number>();

    if (Array.isArray(payload.results)) {
      for (const result of payload.results) {
        if (
          !isRecord(result) ||
          typeof result.path !== 'string' ||
          typeof result.version !== 'number'
        ) {
          continue;
        }

        ackedVersions.set(result.path, result.version);
        const entry = this.store.get(result.path);
        if (entry) {
          entry.version = result.version;
        }
      }
    }
    this.flushDeferred(inflight.paths, ackedVersions);
  }

  private onWriteNack(payload: Extract<ResponsePayload, { kind: 'write-nack' }>): void {
    const inflight = this.settleInflight(payload.reqId);

    if (!inflight) {
      return;
    }

    for (const path of inflight.paths) {
      // A rejected write invalidates any follow-up we were holding for it.
      this.deferredWrites.delete(path);

      const before = inflight.previous.get(path);

      if (before === undefined) {
        this.removeEntry(path);
      } else {
        this.writeEntry(path, before.value, before.version);
      }
    }

    if (Array.isArray(payload.rejected)) {
      for (const rejected of payload.rejected) {
        if (!isRecord(rejected) || typeof rejected.path !== 'string') {
          continue;
        }

        const reason = typeof rejected.reason === 'string' ? rejected.reason : 'conflict';
        this.errorSubs.forEach((cb) => {
          cb(rejected.path, reason);
        });
      }
    }
  }

  private onPeerJoined(userId: UserId): void {
    this.sendSnapshot(userId);
    this.dispatchPeer('joined', userId);
  }

  private onPeerLeft(userId: UserId): void {
    // Free any lock the departing peer still held.
    const owned: string[] = [];
    for (const [key, entry] of this.store) {
      if (key.endsWith(OWNER_SUFFIX) && entry.value === userId) {
        owned.push(key.slice(0, key.length - OWNER_SUFFIX.length));
      }
    }
    for (const [path, waiters] of this.lockWaiters) {
      this.lockWaiters.set(
        path,
        waiters.filter((waiter) => waiter.userId !== userId),
      );
    }
    for (const path of owned) {
      this.hostRelease(userId, path);
    }

    this.dispatchPeer('left', userId);
  }

  private dispatchPeer(event: PeerEvent, userId: UserId): void {
    this.peerSubs.get(event)?.forEach((cb) => {
      cb(userId);
    });
  }

  private hostAcquire(
    userId: UserId,
    path: string,
    reqId: string | undefined,
    grant: (() => void) | undefined,
  ): void {
    if (this.lockOwnerOf(path) === null) {
      this.hostSet(path + OWNER_SUFFIX, userId);
      this.grantLock(userId, reqId, grant);
      return;
    }

    const waiters = this.lockWaiters.get(path) ?? [];
    waiters.push({ userId, reqId, grant });
    this.lockWaiters.set(path, waiters);
  }

  private hostRelease(userId: UserId, path: string): void {
    if (this.lockOwnerOf(path) !== userId) {
      return;
    }

    const next = this.lockWaiters.get(path)?.shift();

    if (next) {
      this.hostSet(path + OWNER_SUFFIX, next.userId);
      this.grantLock(next.userId, next.reqId, next.grant);
    } else {
      this.hostDelete(path + OWNER_SUFFIX);
    }
  }

  private grantLock(
    userId: UserId,
    reqId: string | undefined,
    grant: (() => void) | undefined,
  ): void {
    if (userId === this.transport.selfUserId) {
      grant?.();
    } else if (reqId !== undefined) {
      this.flush();
      this.transport.respondTo(userId, { kind: 'lock-grant', reqId });
    }
  }

  /** Who holds the lock at `path` (editor tooling). */
  lockOwner(path: string): UserId | null {
    return this.lockOwnerOf(path);
  }

  private lockOwnerOf(path: string): UserId | null {
    const owner = this.getValue(path + OWNER_SUFFIX);
    return typeof owner === 'number' ? owner : null;
  }

  private enqueue(path: string, value: unknown): void {
    this.hostSet(path + QUEUE_SUFFIX, JSON.stringify([...this.queueArray(path), value]));
  }

  private dequeue(path: string): unknown {
    const queue = this.queueArray(path);

    if (queue.length === 0) {
      return undefined;
    }

    const [head, ...rest] = queue;
    if (rest.length === 0) {
      this.hostDelete(path + QUEUE_SUFFIX);
    } else {
      this.hostSet(path + QUEUE_SUFFIX, JSON.stringify(rest));
    }

    return head;
  }

  // Queue contents ride net.state as a JSON string under the reserved queue key:
  // items may be nested tables, and one opaque scalar keeps that shape intact
  // through the ordinary patch/snapshot path without flattening each element.
  private queueArray(path: string): unknown[] {
    const raw = this.getValue(path + QUEUE_SUFFIX);
    if (typeof raw !== 'string') {
      return [];
    }

    const cached = this.queueCache.get(path);
    if (cached?.raw === raw) {
      return cached.items;
    }

    let items: unknown[] = [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        items = parsed;
      }
    } catch {
      /* Not a queue; reads as an empty one. */
    }
    this.queueCache.set(path, { raw, items });
    return items;
  }

  private sendSnapshot(userId: UserId): void {
    const entries = [...this.store.entries()]
      .filter(([path]) => this.permissions.canClientRead(ownerPathOf(path)))
      .map(([path, entry]) => ({
        path,
        value: entry.value,
        version: entry.version,
      }));

    this.transport.respondTo(userId, { kind: 'snapshot', entries });
  }

  private writeEntry(path: string, value: TableScalar, version: number): void {
    const previous = this.store.get(path);
    this.store.set(path, { value, version });
    this.fireChange(path, value, previous?.value);
  }

  private removeEntry(path: string): void {
    const previous = this.store.get(path);

    if (previous === undefined) {
      return;
    }

    this.store.delete(path);
    this.fireChange(path, undefined, previous.value);
  }

  private descendants(path: string): string[] {
    const prefix = path + '.';
    const paths: string[] = [];

    for (const key of this.store.keys()) {
      if (key === path || key.startsWith(prefix)) {
        paths.push(key);
      }
    }

    return paths;
  }

  private fireChange(
    path: string,
    newValue: TableScalar | undefined,
    oldValue: TableScalar | undefined,
  ): void {
    if (newValue === oldValue) {
      return;
    }

    // An object's reserved backing (lock owner, queue contents) is not net.state
    // data, so its churn must not fire the game's net.on(path) change listeners.
    if (isReserved(path)) {
      return;
    }

    for (const sub of [...this.changeSubs]) {
      if (sub.regex.test(path)) {
        sub.cb(path, newValue, oldValue);
      }
    }
  }

  private dispatchEvent(name: string, from: UserId, payload: unknown): void {
    if (from === this.transport.selfUserId) {
      return;
    }

    this.eventSubs.get(name)?.forEach((cb) => {
      cb(from, payload);
    });
  }
}
