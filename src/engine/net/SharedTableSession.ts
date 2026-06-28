import { NetConflictError } from "./NetError";
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
};

type StatePayload =
  | { kind: "patch"; ops: PatchOp[] }
  | { kind: "event"; name: string; from: UserId; payload: unknown };

type RequestPayload =
  | { kind: "write"; reqId: string; ops: WriteOp[] }
  | { kind: "event"; name: string; payload: unknown };

// Bootstrap snapshot is a targeted host -> one slave message, so it rides the
// response channel alongside write acks/nacks rather than the broadcast channel.
type ResponsePayload =
  | { kind: "write-ack"; reqId: string; results: Array<{ path: string; version: number }> }
  | { kind: "write-nack"; reqId: string; rejected: Array<{ path: string }> }
  | SnapshotPayload;

interface InflightWrite {
  paths: string[];
  previous: Map<string, TableEntry | undefined>;
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

  private readonly _pendingPatch: PatchOp[] = [];
  private readonly _pendingWrite: WriteOp[] = [];
  private _pendingBefore = new Map<string, TableEntry | undefined>();
  private _flushScheduled = false;

  private readonly _inflight = new Map<string, InflightWrite>();
  private readonly _inflightPaths = new Set<string>();
  private _reqCounter = 0;

  private readonly _changeSubs: Array<{ regex: RegExp; cb: TableChangeListener }> = [];
  private readonly _eventSubs = new Map<string, Set<TableEventListener>>();
  private readonly _errorSubs = new Set<(path: string, reason: string) => void>();

  constructor(transport: SessionTransport) {
    this._transport = transport;
    this._isHost = transport.role === "host";

    transport.on("state", data => this._onState(data as StatePayload));
    transport.on("request", (from, data) => this._onRequest(from, data as RequestPayload));
    transport.on("response", data => this._onResponse(data as ResponsePayload));
    transport.on("peerJoined", userId => this._sendSnapshot(userId));
  }

  destroy(): void {
    this._transport.destroy();
    this._changeSubs.length = 0;
    this._eventSubs.clear();
    this._errorSubs.clear();
    this._store.clear();
  }

  get isHost(): boolean {
    return this._isHost;
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

    this._guardInflight(path);
    const baseVersion = this._store.get(path)?.version ?? 0;
    this._captureBefore(path);
    this._writeEntry(path, value, baseVersion);
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

    for (const p of paths)
      this._guardInflight(p);

    for (const p of paths) {
      const baseVersion = this._store.get(p)?.version ?? 0;
      this._captureBefore(p);
      this._removeEntry(p);
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

  private _guardInflight(path: string): void {
    if (this._inflightPaths.has(path))
      throw new NetConflictError(path);
  }

  private _captureBefore(path: string): void {
    if (!this._pendingBefore.has(path))
      this._pendingBefore.set(path, this._store.get(path));
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
    if (payload.kind === "patch") {
      for (const op of payload.ops) {
        if (op.op === "set")
          this._writeEntry(op.path, op.value, op.version);
        else
          this._removeEntry(op.path);
      }
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
      return;
    }

    for (const p of inflight.paths) {
      const before = inflight.previous.get(p);

      if (before === undefined)
        this._removeEntry(p);
      else
        this._writeEntry(p, before.value, before.version);
    }

    for (const rejected of payload.rejected)
      this._errorSubs.forEach((cb) => cb(rejected.path, "conflict"));
  }

  private _sendSnapshot(userId: UserId): void {
    const entries = [...this._store.entries()].map(([path, entry]) => ({
      path,
      value: entry.value,
      version: entry.version,
    }));

    this._transport.respondTo(userId, { kind: "snapshot", entries });
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
