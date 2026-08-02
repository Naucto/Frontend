import { LUA_PROXY, LuaProxy } from "@engine/lua/LuaEnvironment";
import { NetError } from "@engine/net/NetError";
import { NetHostOptions } from "@engine/net/NetUi";
import { SharedTableSession, TableScalar } from "@engine/net/SharedTableSession";

import { ApiContext } from "./ApiContext";
import { EngineModule } from "./EngineModule";
import { errorMessage } from "./errorMessage";

const EVENT_PREFIX = "event:";

type LuaCallback = (...args: unknown[]) => unknown;

export class NetAPI extends EngineModule {
  private _session: SharedTableSession | null = null;
  // A host/join modal is open but not yet resolved — also blocks a second one.
  private _pending = false;

  constructor(ctx: ApiContext) {
    super(ctx);

    ctx.lua.setGlobalWith("net", {
      state: this._stateProxy(""),
      id: () => this._require().selfUserId,
      on: (pattern: string, callback: LuaCallback) => this._on(pattern, callback),
      emit: (name: string, payload: unknown) => this._require().emit(name, payload),
      lock: (path: string) => this._lockHandle(path),
      queue: (path: string) => this._queue(path),
      host: (configOrCallback?: unknown, maybeCallback?: LuaCallback) => this._host(configOrCallback, maybeCallback),
      join: (callback?: LuaCallback) => this._join(callback),
      leave: () => this._leave(),
    });
  }

  destroy(): void {
    this._session?.destroy();
    this._session = null;
    this._pending = false;
  }

  private _require(): SharedTableSession {
    if (!this._session)
      throw new NetError("net: no active session");

    return this._session;
  }

  // A client must net.leave() before it can host or join something else.
  private _assertNotInSession(): void {
    if (this._session)
      throw new NetError("net: already in a session; call net.leave() first");
  }

  private _ready(session: SharedTableSession | null, callback?: LuaCallback): void {
    this._pending = false;
    this._session = session;

    if (session && callback)
      this._invoke(callback);
  }

  private _leave(): void {
    this.ctx.ui?.leave();
    this._session?.destroy();
    this._session = null;
    this._pending = false;
  }

  // net.host accepts net.host(config, cb), net.host(config) or net.host(cb).
  private _host(configOrCallback: unknown, maybeCallback?: LuaCallback): void {
    // A dialog is already open (e.g. the key that opened it is still held down
    // across frames) — ignore the repeat rather than throwing, which would halt
    // the game.
    if (this._pending)
      return;

    this._assertNotInSession();

    const calledWithCallbackOnly = typeof configOrCallback === "function";
    const config = calledWithCallbackOnly ? {} : configOrCallback;
    const callback = (calledWithCallbackOnly ? configOrCallback : maybeCallback) as LuaCallback | undefined;

    if (!this.ctx.ui)
      return;

    this._pending = true;
    this.ctx.ui.host(this._hostOptions(config), session => this._ready(session, callback));
  }

  private _join(callback?: LuaCallback): void {
    // Same as _host: a dialog already open means ignore the repeat.
    if (this._pending)
      return;

    this._assertNotInSession();

    if (!this.ctx.ui)
      return;

    this._pending = true;
    this.ctx.ui.join(session => this._ready(session, callback));
  }

  private _hostOptions(config: unknown): NetHostOptions {
    const table = (typeof config === "object" && config !== null ? config : {}) as Record<string, unknown>;

    return {
      maxPlayers: typeof table.max_players === "number" ? table.max_players : 2,
      title: typeof table.title === "string" ? table.title : undefined,
    };
  }

  private _stateProxy(prefix: string): LuaProxy {
    const pathOf = (key: string | number): string => (prefix ? `${prefix}.${key}` : String(key));

    return {
      [LUA_PROXY]: true,
      index: key => {
        const session = this._require();
        const path = pathOf(key);
        const value = session.getValue(path);

        if (value !== undefined)
          return value;

        if (session.isContainer(path))
          return this._stateProxy(path);

        return undefined;
      },
      newindex: (key, value) => {
        const session = this._require();
        const path = pathOf(key);

        if (value === undefined || value === null) {
          session.deleteSubtree(path);
          return;
        }

        if (typeof value === "function")
          throw new NetError("net: cannot store a function in net.state");

        if (typeof value === "object") {
          this._assignTable(session, path, value as Record<string, unknown>);
          return;
        }

        session.setValue(path, value as TableScalar);
      },
      keys: () => this._session?.childKeys(prefix) ?? [],
      len: () => this._length(prefix),
    };
  }

  private _length(prefix: string): number {
    if (!this._session)
      return 0;

    let length = 0;
    while (true) {
      const path = prefix ? `${prefix}.${length + 1}` : String(length + 1);

      if (this._session.getValue(path) === undefined && !this._session.isContainer(path))
        break;

      length++;
    }

    return length;
  }

  private _assignTable(session: SharedTableSession, path: string, table: Record<string, unknown>): void {
    session.deleteSubtree(path);

    const walk = (value: unknown, at: string): void => {
      if (value === undefined || value === null)
        return;

      if (typeof value === "function")
        throw new NetError("net: cannot store a function in net.state");

      if (typeof value === "object") {
        for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>))
          walk(childValue, `${at}.${childKey}`);

        return;
      }

      session.setValue(at, value as TableScalar);
    };

    for (const [key, value] of Object.entries(table))
      walk(value, `${path}.${key}`);
  }

  private _on(pattern: string, callback: LuaCallback): void {
    const session = this._require();

    if (pattern === "peer.joined" || pattern === "peer.left") {
      session.onPeer(pattern === "peer.joined" ? "joined" : "left", userId => this._invoke(callback, userId));
      return;
    }

    if (pattern === "ended") {
      session.onEnded(() => this._invoke(callback));
      return;
    }

    if (pattern.startsWith(EVENT_PREFIX)) {
      const name = pattern.slice(EVENT_PREFIX.length);
      session.onEvent(name, (from, payload) => this._invoke(callback, from, payload));
      return;
    }

    session.onChange(pattern, (changedPath, newValue) => this._invoke(callback, changedPath, newValue));
  }

  private _lockHandle(path: string): { acquire: (fn: LuaCallback) => void; is_locked: () => boolean } {
    return {
      acquire: (fn: LuaCallback) => {
        const session = this._require();
        session.acquireLock(path, () => {
          const release = (): void => session.releaseLock(path);
          this._invoke(fn, release);
        });
      },
      is_locked: () => this._require().isLocked(path),
    };
  }

  private _queue(path: string): {
    push: (value: unknown) => void;
    pop: (callback?: LuaCallback) => void;
    length: () => number;
    peek: () => unknown;
  } {
    return {
      push: (value: unknown) => {
        if (typeof value === "function")
          throw new NetError("net: cannot queue a function");

        this._require().queuePush(path, value);
      },
      pop: (callback?: LuaCallback) => this._require().queuePop(path, value => {
        if (callback)
          this._invoke(callback, value);
      }),
      length: () => this._require().queueLength(path),
      peek: () => this._require().queuePeek(path),
    };
  }

  private _invoke(callback: LuaCallback, ...args: unknown[]): void {
    try {
      callback(...args);
    } catch (error) {
      if (error instanceof Error)
        this.ctx.print(errorMessage(error));
    }
  }
}
