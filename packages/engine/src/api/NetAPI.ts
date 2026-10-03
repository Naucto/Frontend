import { NetError } from '../net/NetError';
import type { NetHostOptions } from '../net/NetUi';
import type { SharedTableSession, TableScalar } from '../net/SharedTableSession';
import type { LuaProxy } from '../vm/LuaEnvironment';
import { LUA_PROXY } from '../vm/LuaEnvironment';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { errorMessage } from './errorMessage';
import { defineLuaNamespace, luaFn, luaValue, param } from './lua-namespace';

const EVENT_PREFIX = 'event:';

// Tag identifying a value produced by net.lock() / net.queue(). It must be a
// plain string key: values crossing the Lua VM boundary are deep-copied field by
// field (Object.entries), so a Symbol tag would be dropped and the sentinel would
// reach net.state assignment as an empty table.
const NET_OBJECT = '__net_object__';

type NetObjectKind = 'lock' | 'queue';

const netObjectKind = (value: unknown): NetObjectKind | undefined => {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const tag = (value as Record<string, unknown>)[NET_OBJECT];
  return tag === 'lock' || tag === 'queue' ? tag : undefined;
};

const assertPushable = (value: unknown): void => {
  if (typeof value === 'function') {
    throw new NetError('net: cannot queue a function');
  }
};

type LuaCallback = (...args: unknown[]) => unknown;

/** The table a game gets for a lock, whether it is local or lives in `net.state`. */
interface LuaLock {
  acquire: (fn: LuaCallback) => void;
  is_locked: () => boolean;
}

/** The table a game gets for a queue, whether it is local or lives in `net.state`. */
interface LuaQueue {
  push: (value: unknown) => void;
  pop: (callback?: LuaCallback) => void;
  length: () => number;
  peek: () => unknown;
}

/** A lock or queue not yet in `net.state`, carrying the tag that makes assigning it there work. */
type Tagged<T> = T & { [NET_OBJECT]: NetObjectKind };

export const NET_API = defineLuaNamespace<NetAPI>('net', {
  state: luaValue(
    {
      summary:
        'A table shared by every player in the session. Writes replicate to all peers automatically; reads always return the latest replicated value.',
      type: 'table',
    },
    'stateProxy',
  ),
  host: luaFn(
    {
      summary: 'Open the host dialog; callback() once the session exists.',
      params: [
        param.any('config', { type: 'table', optional: true }),
        param.function('callback', { optional: true }),
      ],
      returns: null,
    },
    'host',
  ),
  join: luaFn(
    {
      summary: 'Open the join dialog.',
      params: [param.function('callback', { optional: true })],
      returns: null,
    },
    'join',
  ),
  leave: luaFn({ summary: 'Leave the current session.', params: [], returns: null }, 'leave'),
  id: luaFn({ summary: 'Your player id in the session.', params: [], returns: 'number' }, 'id'),
  on: luaFn(
    {
      summary: 'React to net.state changes or events.',
      params: [param.string('pattern'), param.function('callback')],
      returns: null,
    },
    'on',
  ),
  emit: luaFn(
    {
      summary: 'Broadcast an event.',
      params: [param.string('name'), param.any('payload', { optional: true })],
      returns: null,
    },
    'emit',
  ),
  lock: luaFn(
    { summary: 'Create a replicated lock value.', params: [], returns: 'table' },
    'localLock',
  ),
  queue: luaFn(
    { summary: 'Create a replicated queue value.', params: [], returns: 'table' },
    'localQueue',
  ),
});

export class NetAPI extends EngineModule {
  private activeSession: SharedTableSession | null = null;
  // A host/join modal is open but not yet resolved — also blocks a second one.
  private pending = false;
  // A dialog may resolve after this run is torn down; what it hands over then is not this run's.
  private destroyed = false;

  /** The live session, for editor tooling (null when the game is not in one). */
  get session(): SharedTableSession | null {
    return this.activeSession;
  }

  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.registerNamespace(NET_API, this);
  }

  /** Nothing local survives a session: the handle and the pending dialog both go with it. */
  private clearLocal(): void {
    this.activeSession = null;
    this.pending = false;
  }

  override destroy(): void {
    this.destroyed = true;
    this.activeSession?.destroy();
    this.clearLocal();
  }

  private require(): SharedTableSession {
    if (!this.activeSession) {
      throw new NetError('net: no active session');
    }

    return this.activeSession;
  }

  id(): number {
    return this.require().selfUserId;
  }

  emit(name: string, payload: unknown): void {
    this.require().emit(name, payload);
  }

  private assertNotInSession(): void {
    if (this.activeSession) {
      throw new NetError('net: already in a session; call net.leave() first');
    }
  }

  private ready(session: SharedTableSession | null, callback?: LuaCallback): void {
    if (this.destroyed) {
      session?.destroy();
      return;
    }

    this.pending = false;
    this.activeSession = session;

    if (!session) {
      return;
    }

    session.onClosed(() => {
      if (this.activeSession === session) {
        this.clearLocal();
      }
    });

    // Deferred so the game's own "ended" listeners fire before the session is destroyed.
    session.onEnded(() => {
      queueMicrotask(() => {
        this.onRemoteEnd(session);
      });
    });

    if (callback) {
      this.invoke(callback);
    }
  }

  private onRemoteEnd(session: SharedTableSession): void {
    if (this.activeSession !== session) {
      return;
    }

    session.destroy();
    this.clearLocal();
  }

  leave(): void {
    // The UI bridge's leave() owns session teardown; only destroy directly when
    // there is no bridge, so the session isn't destroyed twice.
    if (this.ctx.netUi) {
      this.ctx.netUi.leave();
    } else {
      this.activeSession?.destroy();
    }

    this.clearLocal();
  }

  // net.host accepts net.host(config, cb), net.host(config) or net.host(cb).
  host(configOrCallback: unknown, maybeCallback?: LuaCallback): void {
    // A dialog is already open (e.g. the key that opened it is still held down
    // across frames) — ignore the repeat rather than throwing, which would halt
    // the game.
    if (this.pending) {
      return;
    }

    this.assertNotInSession();

    const calledWithCallbackOnly = typeof configOrCallback === 'function';
    const config = calledWithCallbackOnly ? {} : configOrCallback;
    const callback = (calledWithCallbackOnly ? configOrCallback : maybeCallback) as
      LuaCallback | undefined;

    if (!this.ctx.netUi) {
      return;
    }

    this.pending = true;
    this.ctx.netUi.host(this.hostOptions(config), (session) => {
      this.ready(session, callback);
    });
  }

  join(callback?: LuaCallback): void {
    // A dialog already open means the call is a repeat, and is ignored.
    if (this.pending) {
      return;
    }

    this.assertNotInSession();

    if (!this.ctx.netUi) {
      return;
    }

    this.pending = true;
    this.ctx.netUi.join((session) => {
      this.ready(session, callback);
    });
  }

  private hostOptions(config: unknown): NetHostOptions {
    const table = (typeof config === 'object' && config !== null ? config : {}) as Record<
      string,
      unknown
    >;

    return {
      maxPlayers: typeof table.max_players === 'number' ? table.max_players : 2,
      title: typeof table.title === 'string' ? table.title : undefined,
    };
  }

  /**
   * What a value written into the shared table is: the kind of object it declares, or nothing for
   * a value the session stores as it stands. A function is neither -- it cannot be replicated.
   */
  private storeableKind(value: unknown): NetObjectKind | undefined {
    if (typeof value === 'function') {
      throw new NetError('net: cannot store a function in net.state');
    }

    return netObjectKind(value);
  }

  stateProxy(prefix = ''): LuaProxy {
    const pathOf = (key: string | number): string => (prefix ? `${prefix}.${key}` : String(key));

    return {
      [LUA_PROXY]: true,
      index: (key) => {
        const session = this.require();
        const path = pathOf(key);

        // A lock/queue lives *at* this path: surface its handle, never the raw
        // reserved backing. Checked first so it wins over the empty-branch view.
        const kind = session.objectKindAt(path);
        if (kind === 'lock') {
          return this.lockHandle(path);
        }
        if (kind === 'queue') {
          return this.queue(path);
        }

        const value = session.getValue(path);

        if (value !== undefined) {
          return value;
        }

        if (session.isContainer(path)) {
          return this.stateProxy(path);
        }

        return undefined;
      },
      newindex: (key, value) => {
        const session = this.require();
        const path = pathOf(key);

        if (value === undefined || value === null) {
          session.deleteSubtree(path);
          return;
        }

        const kind = this.storeableKind(value);
        if (kind) {
          session.declareObject(path, kind);
          return;
        }

        if (typeof value === 'object') {
          this.assignTable(session, path, value as Record<string, unknown>);
          return;
        }

        // Overwriting an existing lock/queue with a plain value: drop the object
        // first so its handle stops shadowing the new scalar.
        if (session.objectKindAt(path) !== undefined) {
          session.deleteSubtree(path);
        }

        session.setValue(path, value as TableScalar);
      },
      keys: () => this.activeSession?.childKeys(prefix) ?? [],
      len: () => this.length(prefix),
    };
  }

  private length(prefix: string): number {
    if (!this.activeSession) {
      return 0;
    }

    let length = 0;
    while (true) {
      const path = prefix ? `${prefix}.${length + 1}` : String(length + 1);

      if (
        this.activeSession.getValue(path) === undefined &&
        !this.activeSession.isContainer(path) &&
        this.activeSession.objectKindAt(path) === undefined
      ) {
        break;
      }

      length++;
    }

    return length;
  }

  private assignTable(
    session: SharedTableSession,
    path: string,
    table: Record<string, unknown>,
  ): void {
    // Collected before anything is deleted, so a value that cannot be stored leaves `path` intact.
    const writes: [string, unknown][] = [];
    const walk = (value: unknown, at: string): void => {
      if (value === undefined || value === null) {
        return;
      }

      if (this.storeableKind(value) === undefined && typeof value === 'object') {
        for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
          walk(childValue, `${at}.${childKey}`);
        }

        return;
      }

      writes.push([at, value]);
    };

    for (const [key, value] of Object.entries(table)) {
      walk(value, `${path}.${key}`);
    }

    session.deleteSubtree(path);

    for (const [at, value] of writes) {
      const kind = netObjectKind(value);
      if (kind) {
        session.declareObject(at, kind);
      } else {
        session.setValue(at, value as TableScalar);
      }
    }
  }

  on(pattern: string, callback: LuaCallback): void {
    const session = this.require();

    if (pattern === 'peer.joined' || pattern === 'peer.left') {
      session.onPeer(pattern === 'peer.joined' ? 'joined' : 'left', (userId) => {
        this.invoke(callback, userId);
      });
      return;
    }

    if (pattern === 'ended') {
      session.onEnded(() => {
        this.invoke(callback);
      });
      return;
    }

    if (pattern === 'error') {
      session.onError((path, reason) => {
        this.invoke(callback, path, reason);
      });
      return;
    }

    if (pattern.startsWith(EVENT_PREFIX)) {
      const name = pattern.slice(EVENT_PREFIX.length);
      session.onEvent(name, (from, payload) => {
        this.invoke(callback, from, payload);
      });
      return;
    }

    session.onChange(pattern, (changedPath, newValue) => {
      this.invoke(callback, changedPath, newValue);
    });
  }

  // net.lock() / net.queue() build a local, in-VM object usable with no session.
  // Assigning it into net.state (its NET_OBJECT tag is caught by newindex) is what
  // turns it into the replicated, host-ordered version; left out of net.state it
  // stays a plain local primitive. Both carry the tag so the assignment works.
  localLock(): Tagged<LuaLock> {
    // One Lua VM has no real contention, so a local lock grants immediately; it
    // exists so the same code runs whether or not the lock is shared.
    let held = false;

    return {
      [NET_OBJECT]: 'lock',
      acquire: (fn: LuaCallback) => {
        held = true;
        this.invoke(fn, () => {
          held = false;
        });
      },
      is_locked: () => held,
    };
  }

  localQueue(): Tagged<LuaQueue> {
    const items: unknown[] = [];

    return {
      [NET_OBJECT]: 'queue',
      push: (value: unknown) => {
        assertPushable(value);

        items.push(value);
      },
      pop: (callback?: LuaCallback) => {
        const value = items.shift();
        if (callback) {
          this.invoke(callback, value);
        }
      },
      length: () => items.length,
      peek: () => items[0],
    };
  }

  private lockHandle(path: string): LuaLock {
    return {
      acquire: (fn: LuaCallback) => {
        const session = this.require();
        session.acquireLock(path, () => {
          const release = (): void => {
            session.releaseLock(path);
          };
          this.invoke(fn, release);
        });
      },
      is_locked: () => this.require().isLocked(path),
    };
  }

  private queue(path: string): LuaQueue {
    return {
      push: (value: unknown) => {
        assertPushable(value);

        this.require().queuePush(path, value);
      },
      pop: (callback?: LuaCallback) => {
        this.require().queuePop(path, (value) => {
          if (callback) {
            this.invoke(callback, value);
          }
        });
      },
      length: () => this.require().queueLength(path),
      peek: () => this.require().queuePeek(path),
    };
  }

  private invoke(callback: LuaCallback, ...args: unknown[]): void {
    try {
      callback(...args);
    } catch (error) {
      if (error instanceof Error) {
        this.ctx.print(errorMessage(error));
      }
    }
  }
}
