import { NetError } from '../net/NetError';
import type { NetHostOptions } from '../net/NetUi';
import type { SharedTableSession, TableScalar } from '../net/SharedTableSession';
import type { LuaProxy } from '../vm/LuaEnvironment';
import { LUA_PROXY } from '../vm/LuaEnvironment';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { errorMessage } from './errorMessage';

const EVENT_PREFIX = 'event:';

// Tag identifying a value produced by net.lock() / net.queue(). It must be a
// plain string key: values crossing the Lua VM boundary are deep-copied field by
// field (Object.entries), so a Symbol tag would be dropped and the sentinel would
// reach net.state assignment as an empty table.
const NET_OBJECT = '__net_object__';

type NetObjectKind = 'lock' | 'queue';

const netObjectKind = (value: unknown): NetObjectKind | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;

  const tag = (value as Record<string, unknown>)[NET_OBJECT];
  return tag === 'lock' || tag === 'queue' ? tag : undefined;
};

type LuaCallback = (...args: unknown[]) => unknown;

export class NetAPI extends EngineModule {
  private _session: SharedTableSession | null = null;
  // A host/join modal is open but not yet resolved — also blocks a second one.
  private _pending = false;

  constructor(ctx: ApiContext) {
    super(ctx);

    ctx.lua.setGlobalWith('net', {
      state: this._stateProxy(''),
      id: () => this._require().selfUserId,
      on: (pattern: string, callback: LuaCallback) => {
        this._on(pattern, callback);
      },
      emit: (name: string, payload: unknown) => {
        this._require().emit(name, payload);
      },
      lock: () => this._localLock(),
      queue: () => this._localQueue(),
      host: (configOrCallback?: unknown, maybeCallback?: LuaCallback) => {
        this._host(configOrCallback, maybeCallback);
      },
      join: (callback?: LuaCallback) => {
        this._join(callback);
      },
      leave: () => {
        this._leave();
      },
    });
  }

  override destroy(): void {
    this._session?.destroy();
    this._session = null;
    this._pending = false;
  }

  private _require(): SharedTableSession {
    if (!this._session) throw new NetError('net: no active session');

    return this._session;
  }

  // A client must net.leave() before it can host or join something else.
  private _assertNotInSession(): void {
    if (this._session) throw new NetError('net: already in a session; call net.leave() first');
  }

  private _ready(session: SharedTableSession | null, callback?: LuaCallback): void {
    this._pending = false;
    this._session = session;

    if (!session) return;

    // A session can end remotely (e.g. the host leaves). Tear it down and clear
    // local state so net.host()/net.join() don't throw from _assertNotInSession
    // and halt the game loop. Defer so the game's own net.on("ended") listeners
    // still fire before the session is destroyed.
    session.onEnded(() => {
      queueMicrotask(() => {
        this._onRemoteEnd(session);
      });
    });

    if (callback) this._invoke(callback);
  }

  private _onRemoteEnd(session: SharedTableSession): void {
    if (this._session !== session) return;

    session.destroy();
    this._session = null;
    this._pending = false;
  }

  private _leave(): void {
    // The UI bridge's leave() owns session teardown; only destroy directly when
    // there is no bridge, so the session isn't destroyed twice.
    if (this.ctx.netUi) this.ctx.netUi.leave();
    else this._session?.destroy();

    this._session = null;
    this._pending = false;
  }

  // net.host accepts net.host(config, cb), net.host(config) or net.host(cb).
  private _host(configOrCallback: unknown, maybeCallback?: LuaCallback): void {
    // A dialog is already open (e.g. the key that opened it is still held down
    // across frames) — ignore the repeat rather than throwing, which would halt
    // the game.
    if (this._pending) return;

    this._assertNotInSession();

    const calledWithCallbackOnly = typeof configOrCallback === 'function';
    const config = calledWithCallbackOnly ? {} : configOrCallback;
    const callback = (calledWithCallbackOnly ? configOrCallback : maybeCallback) as
      LuaCallback | undefined;

    if (!this.ctx.netUi) return;

    this._pending = true;
    this.ctx.netUi.host(this._hostOptions(config), (session) => {
      this._ready(session, callback);
    });
  }

  private _join(callback?: LuaCallback): void {
    // Same as _host: a dialog already open means ignore the repeat.
    if (this._pending) return;

    this._assertNotInSession();

    if (!this.ctx.netUi) return;

    this._pending = true;
    this.ctx.netUi.join((session) => {
      this._ready(session, callback);
    });
  }

  private _hostOptions(config: unknown): NetHostOptions {
    const table = (typeof config === 'object' && config !== null ? config : {}) as Record<
      string,
      unknown
    >;

    return {
      maxPlayers: typeof table.max_players === 'number' ? table.max_players : 2,
      title: typeof table.title === 'string' ? table.title : undefined,
    };
  }

  private _stateProxy(prefix: string): LuaProxy {
    const pathOf = (key: string | number): string => (prefix ? `${prefix}.${key}` : String(key));

    return {
      [LUA_PROXY]: true,
      index: (key) => {
        const session = this._require();
        const path = pathOf(key);

        // A lock/queue lives *at* this path: surface its handle, never the raw
        // reserved backing. Checked first so it wins over the empty-branch view.
        const kind = session.objectKindAt(path);
        if (kind === 'lock') return this._lockHandle(path);
        if (kind === 'queue') return this._queue(path);

        const value = session.getValue(path);

        if (value !== undefined) return value;

        if (session.isContainer(path)) return this._stateProxy(path);

        return undefined;
      },
      newindex: (key, value) => {
        const session = this._require();
        const path = pathOf(key);

        if (value === undefined || value === null) {
          session.deleteSubtree(path);
          return;
        }

        const kind = netObjectKind(value);
        if (kind) {
          session.declareObject(path, kind);
          return;
        }

        if (typeof value === 'function')
          throw new NetError('net: cannot store a function in net.state');

        if (typeof value === 'object') {
          this._assignTable(session, path, value as Record<string, unknown>);
          return;
        }

        // Overwriting an existing lock/queue with a plain value: drop the object
        // first so its handle stops shadowing the new scalar.
        if (session.objectKindAt(path) !== undefined) session.deleteSubtree(path);

        session.setValue(path, value as TableScalar);
      },
      keys: () => this._session?.childKeys(prefix) ?? [],
      len: () => this._length(prefix),
    };
  }

  private _length(prefix: string): number {
    if (!this._session) return 0;

    let length = 0;
    while (true) {
      const path = prefix ? `${prefix}.${length + 1}` : String(length + 1);

      if (
        this._session.getValue(path) === undefined &&
        !this._session.isContainer(path) &&
        this._session.objectKindAt(path) === undefined
      )
        break;

      length++;
    }

    return length;
  }

  private _assignTable(
    session: SharedTableSession,
    path: string,
    table: Record<string, unknown>,
  ): void {
    session.deleteSubtree(path);

    const walk = (value: unknown, at: string): void => {
      if (value === undefined || value === null) return;

      const kind = netObjectKind(value);
      if (kind) {
        session.declareObject(at, kind);
        return;
      }

      if (typeof value === 'function')
        throw new NetError('net: cannot store a function in net.state');

      if (typeof value === 'object') {
        for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>))
          walk(childValue, `${at}.${childKey}`);

        return;
      }

      session.setValue(at, value as TableScalar);
    };

    for (const [key, value] of Object.entries(table)) walk(value, `${path}.${key}`);
  }

  private _on(pattern: string, callback: LuaCallback): void {
    const session = this._require();

    if (pattern === 'peer.joined' || pattern === 'peer.left') {
      session.onPeer(pattern === 'peer.joined' ? 'joined' : 'left', (userId) => {
        this._invoke(callback, userId);
      });
      return;
    }

    if (pattern === 'ended') {
      session.onEnded(() => {
        this._invoke(callback);
      });
      return;
    }

    if (pattern === 'error') {
      session.onError((path, reason) => {
        this._invoke(callback, path, reason);
      });
      return;
    }

    if (pattern.startsWith(EVENT_PREFIX)) {
      const name = pattern.slice(EVENT_PREFIX.length);
      session.onEvent(name, (from, payload) => {
        this._invoke(callback, from, payload);
      });
      return;
    }

    session.onChange(pattern, (changedPath, newValue) => {
      this._invoke(callback, changedPath, newValue);
    });
  }

  // net.lock() / net.queue() build a local, in-VM object usable with no session.
  // Assigning it into net.state (its NET_OBJECT tag is caught by newindex) is what
  // turns it into the replicated, host-ordered version; left out of net.state it
  // stays a plain local primitive. Both carry the tag so the assignment works.
  private _localLock(): {
    [NET_OBJECT]: NetObjectKind;
    acquire: (fn: LuaCallback) => void;
    is_locked: () => boolean;
  } {
    // One Lua VM has no real contention, so a local lock grants immediately; it
    // exists so the same code runs whether or not the lock is shared.
    let held = false;

    return {
      [NET_OBJECT]: 'lock',
      acquire: (fn: LuaCallback) => {
        held = true;
        this._invoke(fn, () => {
          held = false;
        });
      },
      is_locked: () => held,
    };
  }

  private _localQueue(): {
    [NET_OBJECT]: NetObjectKind;
    push: (value: unknown) => void;
    pop: (callback?: LuaCallback) => void;
    length: () => number;
    peek: () => unknown;
  } {
    const items: unknown[] = [];

    return {
      [NET_OBJECT]: 'queue',
      push: (value: unknown) => {
        if (typeof value === 'function') throw new NetError('net: cannot queue a function');

        items.push(value);
      },
      pop: (callback?: LuaCallback) => {
        const value = items.shift();
        if (callback) this._invoke(callback, value);
      },
      length: () => items.length,
      peek: () => items[0],
    };
  }

  private _lockHandle(path: string): {
    acquire: (fn: LuaCallback) => void;
    is_locked: () => boolean;
  } {
    return {
      acquire: (fn: LuaCallback) => {
        const session = this._require();
        session.acquireLock(path, () => {
          const release = (): void => {
            session.releaseLock(path);
          };
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
        if (typeof value === 'function') throw new NetError('net: cannot queue a function');

        this._require().queuePush(path, value);
      },
      pop: (callback?: LuaCallback) => {
        this._require().queuePop(path, (value) => {
          if (callback) this._invoke(callback, value);
        });
      },
      length: () => this._require().queueLength(path),
      peek: () => this._require().queuePeek(path),
    };
  }

  private _invoke(callback: LuaCallback, ...args: unknown[]): void {
    try {
      callback(...args);
    } catch (error) {
      if (error instanceof Error) this.ctx.print(errorMessage(error));
    }
  }
}
