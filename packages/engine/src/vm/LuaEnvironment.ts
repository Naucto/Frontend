// @ts-expect-error This is a pure JS library.
import fengari from 'fengari';

import type { LuaNamespace } from '../api/lua-namespace';
import { MAIN_FILE } from '../game/keys';

export type LuaCallable = (...args: unknown[]) => unknown;

// Method returns are marshalled with pushObject, so `index` returning another
// metatable-backed value nests — unlike a raw fengari metamethod return.
export interface LuaMetatable {
  index?(key: string | number): unknown;
  newindex?(key: string | number, value: unknown): void;
  call?(...args: unknown[]): unknown;
  tostring?(): string;
  len?(): number;
  unm?(operand: unknown): unknown;
  add?(left: unknown, right: unknown): unknown;
  sub?(left: unknown, right: unknown): unknown;
  mul?(left: unknown, right: unknown): unknown;
  div?(left: unknown, right: unknown): unknown;
  mod?(left: unknown, right: unknown): unknown;
  pow?(left: unknown, right: unknown): unknown;
  concat?(left: unknown, right: unknown): unknown;
  eq?(left: unknown, right: unknown): boolean;
  lt?(left: unknown, right: unknown): boolean;
  le?(left: unknown, right: unknown): boolean;
  // Drives __pairs; iteration values come from `index`.
  keys?(): string[];
}

type LuaMetamethod = keyof LuaMetatable;

export type MetamethodHandler = (args: unknown[]) => unknown[];

export const LUA_PROXY: unique symbol = Symbol('LuaProxy');

// The brand makes pushObject install this implicitly as a metatable-backed table;
// a bare LuaMetatable is instead attached explicitly via setMetatable.
export type LuaProxy = LuaMetatable & { readonly [LUA_PROXY]: true };

// argStart skips the self table for metamethods where it carries no information.
interface MetamethodSpec {
  meta: string;
  method: LuaMetamethod;
  argStart: number;
  argCount?: number;
  pushResult: boolean;
}

const METAMETHOD_SPECS: readonly MetamethodSpec[] = [
  { meta: '__index', method: 'index', argStart: 2, argCount: 1, pushResult: true },
  { meta: '__newindex', method: 'newindex', argStart: 2, argCount: 2, pushResult: false },
  { meta: '__call', method: 'call', argStart: 2, pushResult: true },
  { meta: '__tostring', method: 'tostring', argStart: 1, argCount: 0, pushResult: true },
  { meta: '__len', method: 'len', argStart: 1, argCount: 0, pushResult: true },
  { meta: '__unm', method: 'unm', argStart: 1, argCount: 1, pushResult: true },
  { meta: '__add', method: 'add', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__sub', method: 'sub', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__mul', method: 'mul', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__div', method: 'div', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__mod', method: 'mod', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__pow', method: 'pow', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__concat', method: 'concat', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__eq', method: 'eq', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__lt', method: 'lt', argStart: 1, argCount: 2, pushResult: true },
  { meta: '__le', method: 'le', argStart: 1, argCount: 2, pushResult: true },
];

const isLuaProxy = (value: unknown): value is LuaProxy =>
  typeof value === 'object' &&
  value !== null &&
  (value as Record<symbol, unknown>)[LUA_PROXY] === true;

export interface LuaErrorLocation {
  file?: string;
  line?: number;
}

const WRAPPERS = ['Runtime error: ', 'Failed to load code fragment: '];
const QUOTED = /^\[(?:string )?"([^"]*)"\]:(\d+):/;

/**
 * Which chunk a Lua message blames, and at what line.
 *
 * The runtime writes the chunk's name back verbatim, and a name may hold spaces, so nothing in the
 * message itself marks where the name ends — only the list of names that were loaded does. Longest
 * first, so a name that begins with another is not read as the shorter one; and a name nobody
 * loaded is left unattributed rather than guessed at.
 */
export const parseLuaErrorLocation = (
  message: string,
  known: readonly string[] = [],
): LuaErrorLocation => {
  let rest = message;
  for (const wrapper of WRAPPERS) {
    if (rest.startsWith(wrapper)) {
      rest = rest.slice(wrapper.length);
      break;
    }
  }
  const quoted = QUOTED.exec(rest);
  if (quoted?.[1] !== undefined && quoted[2] !== undefined) {
    return { file: quoted[1], line: Number(quoted[2]) };
  }
  for (const name of [...known].sort((a, b) => b.length - a.length)) {
    if (!rest.startsWith(`${name}:`)) {
      continue;
    }
    const line = /^(\d+):/.exec(rest.slice(name.length + 1));
    if (line?.[1] !== undefined) {
      return { file: name, line: Number(line[1]) };
    }
  }
  return {};
};

class LuaError extends Error {
  readonly file: string | undefined;
  readonly line: number | undefined;
  readonly traceback: string | undefined;

  constructor(message: string, traceback?: string, known: readonly string[] = []) {
    super(message);
    this.name = 'LuaError';
    const loc = parseLuaErrorLocation(message, known);
    this.file = loc.file;
    this.line = loc.line;
    this.traceback = traceback;
  }
}
const HOOK_INTERVAL = 100_000;
const INSTRUCTION_LIMIT = 10_000_000;
const HOST_OS = ['execute', 'getenv', 'remove', 'rename', 'tmpname', 'exit'];

/**
 * How many tables deep a value read out of the VM may nest. The walk pushes one stack slot per
 * level, and fengari throws `stack overflow` once its own stack outgrows the calling frame, so the
 * bound has to sit below that rather than at whatever the walk would survive.
 */
const MAX_TABLE_DEPTH = 10;

class LuaEnvironment {
  luaState: fengari.lua.lua_State;
  private instructionsUsed = 0;
  /** The proxy behind each table `pushObject` bridged; such a table holds nothing of its own. */
  private readonly bridged = new WeakMap<object, LuaProxy>();
  /**
   * The thread values are read from and pushed to: the main state, or the coroutine a host
   * function was called from while that call runs, since each thread has a stack of its own.
   */
  private stack: fengari.lua.lua_State;

  constructor() {
    this.luaState = fengari.lauxlib.luaL_newstate();
    this.stack = this.luaState;
    fengari.lualib.luaL_openlibs(this.luaState);
    this.hideHostOs();
    this.installInstructionGuard();
  }

  /**
   * fengari installs the host-bound half of `os` whenever the host has a `process`, which every
   * host but a browser does, so a game would otherwise reach a shell and the environment through a
   * library none of it ever promised.
   */
  private hideHostOs(): void {
    const luaState = this.luaState;
    fengari.lua.lua_getglobal(luaState, fengari.to_luastring('os'));
    for (const name of HOST_OS) {
      fengari.lua.lua_pushnil(luaState);
      fengari.lua.lua_setfield(luaState, -2, fengari.to_luastring(name));
    }
    fengari.lua.lua_pop(luaState, 1);
    // fengari's file and C loaders fetch any URL; the package table stays reachable through
    // `require`'s upvalue whatever the globals say, so the loaders themselves have to go.
    fengari.lauxlib.luaL_dostring(
      luaState,
      fengari.to_luastring(
        'package.loadlib, package.cpath, package.path = nil, "", ""\n' +
          'for i = #package.searchers, 2, -1 do package.searchers[i] = nil end\n' +
          'debug.getregistry = nil',
      ),
    );
  }

  /**
   * Installs a count hook that aborts execution after INSTRUCTION_LIMIT
   * instructions within a single evaluation. This turns otherwise-fatal
   * infinite loops and runaway recursion into a normal runtime error that the
   * caller can catch and report, rather than a hung tab.
   */
  private installInstructionGuard(): void {
    const hook = (luaState: fengari.lua.lua_State): void => {
      this.instructionsUsed += HOOK_INTERVAL;
      if (this.instructionsUsed > INSTRUCTION_LIMIT) {
        fengari.lauxlib.luaL_error(
          luaState,
          fengari.to_luastring('execution aborted: possible infinite loop or recursion'),
        );
      }
    };

    fengari.lua.lua_sethook(this.luaState, hook, fengari.lua.LUA_MASKCOUNT, HOOK_INTERVAL);
  }

  private getErrorMessage(): string {
    const raw = fengari.lua.lua_tostring(this.stack, -1);
    const typeName = fengari.to_jsstring(
      fengari.lua.lua_typename(this.stack, fengari.lua.lua_type(this.stack, -1)),
    );
    fengari.lua.lua_pop(this.stack, 1);

    return raw ? fengari.to_jsstring(raw) : `non-string error (${typeName})`;
  }

  public getObject(index: number): unknown {
    return this.readValue(index, 0, null);
  }

  /** A bridged table read back is a copy of what its proxy lists, since its raw entries are empty. */
  private snapshot(proxy: LuaProxy, depth = 0): Record<string, unknown> {
    if (depth >= MAX_TABLE_DEPTH) {
      throw new LuaError('table nested deeper than the host can take');
    }

    const table: Record<string, unknown> = {};
    for (const key of proxy.keys?.() ?? []) {
      const value = proxy.index?.(key);
      table[key] = isLuaProxy(value) ? this.snapshot(value, depth + 1) : value;
    }

    return table;
  }

  /**
   * `inside` holds the addresses of the tables this read is already within, so a table that reaches
   * itself is a cycle rather than an endless walk. It stays null until the read meets a table, since
   * nearly every read is a scalar argument of a host call.
   */
  private readValue(index: number, depth: number, inside: Set<number> | null): unknown {
    let value: unknown;

    switch (fengari.lua.lua_type(this.stack, index)) {
      case fengari.lua.LUA_TNIL:
      case fengari.lua.LUA_TNONE:
        value = undefined;
        break;

      case fengari.lua.LUA_TBOOLEAN:
        value = Boolean(fengari.lua.lua_toboolean(this.stack, index));
        break;

      case fengari.lua.LUA_TNUMBER:
        value = fengari.lua.lua_tonumber(this.stack, index);
        break;

      case fengari.lua.LUA_TSTRING:
        value = fengari.to_jsstring(fengari.lua.lua_tostring(this.stack, index));
        break;

      case fengari.lua.LUA_TTABLE: {
        // lua_next needs an absolute index: pushing the iteration key shifts a
        // relative (negative) index and corrupts nested-table marshalling.
        const tableIndex = index < 0 ? fengari.lua.lua_gettop(this.stack) + index + 1 : index;
        const address = fengari.lua.lua_topointer(this.stack, tableIndex);
        const bridged = this.bridged.get(address);
        if (bridged) {
          value = this.snapshot(bridged);
          break;
        }
        const within = inside ?? new Set<number>();
        if (within.has(address)) {
          throw new LuaError('table contains itself');
        }
        if (depth >= MAX_TABLE_DEPTH) {
          throw new LuaError('table nested deeper than the host can take');
        }

        within.add(address);
        const table: Record<string, unknown> = {};
        try {
          fengari.lua.lua_pushnil(this.stack);
          while (fengari.lua.lua_next(this.stack, tableIndex) !== 0) {
            const key = String(this.readValue(-2, depth + 1, within));
            table[key] = this.readValue(-1, depth + 1, within);
            fengari.lua.lua_pop(this.stack, 1);
          }
        } finally {
          within.delete(address);
        }

        value = table;
        break;
      }

      case fengari.lua.LUA_TFUNCTION: {
        const func = fengari.lua.lua_toproxy(this.stack, index);

        value = (...args: unknown[]): unknown => {
          const stackTop = fengari.lua.lua_gettop(this.stack);

          func(this.stack);
          args.forEach((arg) => {
            this.pushObject(arg);
          });

          const success =
            fengari.lua.lua_pcall(this.stack, args.length, fengari.lua.LUA_MULTRET, 0) ===
            fengari.lua.LUA_OK;

          if (!success) {
            const errorMessage = this.getErrorMessage();
            throw new LuaError(`Runtime error: ${errorMessage}`, undefined, this.chunkNames);
          }

          const results: unknown[] = [];
          for (let i = stackTop + 1; i <= fengari.lua.lua_gettop(this.stack); i++) {
            results.push(this.getObject(i));
          }

          return results;
        };

        break;
      }
      default: {
        const typeName = fengari.to_jsstring(
          fengari.lua.lua_typename(this.stack, fengari.lua.lua_type(this.stack, index)),
        );
        throw new LuaError(`Unsupported Lua type ${typeName}`);
      }
    }

    return value;
  }

  /**
   * A JS throw escaping into fengari surfaces as an opaque non-string error, so it is turned into a
   * proper Lua error carrying the message.
   */
  private asLuaError(state: fengari.lua_State, error: unknown): number {
    return fengari.lauxlib.luaL_error(
      state,
      fengari.to_luastring(error instanceof Error ? error.message : String(error)),
    );
  }

  public pushObject(value: unknown): void {
    if (value === null) {
      value = undefined;
    }

    switch (typeof value) {
      case 'boolean':
        fengari.lua.lua_pushboolean(this.stack, value ? 1 : 0);
        break;

      case 'number':
        // Integer-valued numbers must push as Lua integers; otherwise ids and
        // counters surface as floats ("1.0") and break string concatenation.
        if (Number.isInteger(value)) {
          fengari.lua.lua_pushinteger(this.stack, value);
        } else {
          fengari.lua.lua_pushnumber(this.stack, value);
        }
        break;

      case 'string':
        fengari.lua.lua_pushstring(this.stack, fengari.to_luastring(value));
        break;

      case 'object':
        if (isLuaProxy(value)) {
          this.pushBridgedTable(this.buildMetatableHandlers(value));
          this.bridged.set(fengari.lua.lua_topointer(this.stack, -1), value);
          break;
        }

        if (Array.isArray(value)) {
          fengari.lua.lua_createtable(this.stack, value.length, 0);

          value.forEach((element, i) => {
            this.pushObject(element);
            fengari.lua.lua_rawseti(this.stack, -2, i + 1);
          });
        } else {
          fengari.lua.lua_createtable(this.stack, 0, 0);

          Object.entries(value as Record<string, unknown>).forEach(([key, entryValue]) => {
            this.pushObject(key);
            this.pushObject(entryValue);
            fengari.lua.lua_settable(this.stack, -3);
          });
        }

        break;

      case 'function':
        fengari.lua.lua_pushjsfunction(this.stack, (state: fengari.lua_State) => {
          const outer = this.stack;
          this.stack = state;
          // A JS throw escaping into fengari surfaces as an opaque non-string
          // error, so convert it into a proper Lua error carrying the message.
          try {
            const count = fengari.lua.lua_gettop(state);
            const args: unknown[] = new Array(count);
            for (let i = 0; i < count; i++) {
              args[i] = this.getObject(i + 1);
            }
            fengari.lua.lua_settop(state, 0);

            const returnValues = value(...args);

            // An array becomes multiple Lua return values; anything else (scalar,
            // table, proxy, nil) is one value marshalled through pushObject.
            if (Array.isArray(returnValues)) {
              returnValues.forEach((entry) => {
                this.pushObject(entry);
              });
              return returnValues.length;
            }

            this.pushObject(returnValues);
            return 1;
          } catch (error) {
            return this.asLuaError(state, error);
          } finally {
            this.stack = outer;
          }
        });
        break;

      case 'undefined':
        fengari.lua.lua_pushnil(this.stack);
        break;

      default:
        throw new LuaError(`Unsupported JavaScript type ${typeof value}`);
    }
  }

  // Pushes the metatable alone; attaching it to the table below it on the stack is the caller's.
  private pushMetatable(handlers: Record<string, MetamethodHandler>): void {
    const stack = this.stack;
    fengari.lua.lua_createtable(stack, 0, 0);

    for (const meta of Object.keys(handlers)) {
      const handler = handlers[meta]!;

      fengari.lua.lua_pushjsfunction(stack, (state: fengari.lua_State) => {
        const outer = this.stack;
        this.stack = state;
        try {
          const top = fengari.lua.lua_gettop(state);
          const args: unknown[] = [];
          for (let i = 1; i <= top; i++) {
            args.push(this.getObject(i));
          }

          const results = handler(args);
          for (const value of results) {
            this.pushObject(value);
          }

          return results.length;
        } catch (error) {
          return this.asLuaError(state, error);
        } finally {
          this.stack = outer;
        }
      });

      fengari.lua.lua_setfield(stack, -2, fengari.to_luastring(meta));
    }
  }

  public pushBridgedTable(handlers: Record<string, MetamethodHandler>): void {
    fengari.lua.lua_createtable(this.stack, 0, 0);
    this.pushMetatable(handlers);
    fengari.lua.lua_setmetatable(this.stack, -2);
  }

  private buildMetatableHandlers(meta: LuaMetatable): Record<string, MetamethodHandler> {
    const handlers: Record<string, MetamethodHandler> = {};

    for (const spec of METAMETHOD_SPECS) {
      const method = meta[spec.method];

      if (typeof method !== 'function') {
        continue;
      }

      handlers[spec.meta] = (args: unknown[]): unknown[] => {
        const start = spec.argStart - 1;
        const slice =
          spec.argCount === undefined
            ? args.slice(start)
            : args.slice(start, start + spec.argCount);
        const result = (method as (...a: unknown[]) => unknown).apply(meta, slice);

        return spec.pushResult ? [result] : [];
      };
    }

    if (meta.keys) {
      handlers.__pairs = this.pairsHandler(meta);
    }

    return handlers;
  }

  private pairsHandler(meta: LuaMetatable): MetamethodHandler {
    return (): unknown[] => {
      const keys = meta.keys!();
      let cursor = 0;

      const iterator = (): unknown => {
        if (cursor >= keys.length) {
          return undefined;
        }

        const key = keys[cursor++]!;
        return [key, meta.index ? meta.index(key) : undefined];
      };

      return [iterator];
    };
  }

  public setGlobalWith(name: string, value: unknown): void {
    this.pushObject(value);
    this.setGlobal(name);
  }

  /**
   * Sets the global table a namespace describes, its functions calling `api` with each argument
   * read as its parameter says. A parameter that refuses its value raises Lua's `bad argument`.
   */
  public registerNamespace<Api>(namespace: LuaNamespace<Api>, api: Api): void {
    const table: Record<string, unknown> = {};
    for (const [name, member] of Object.entries(namespace.members)) {
      if (member.kind === 'value') {
        table[name] = member.value(api);
        continue;
      }
      const params = member.params;
      table[name] = (...args: unknown[]) => {
        const values: unknown[] = new Array(params.length);
        let i = 0;
        try {
          for (; i < params.length; i++) {
            const param = params[i]!;
            values[i] = param.rest
              ? param.read(args.slice(i), true)
              : param.read(args[i], i < args.length);
          }
        } catch (error) {
          throw new LuaError(
            `bad argument #${String(i + 1)} to '${namespace.name}.${name}' (${error instanceof Error ? error.message : String(error)})`,
          );
        }
        return member.call(api, values);
      };
    }
    this.setGlobalWith(namespace.name, table);
  }

  public setGlobal(name: string): void {
    fengari.lua.lua_setglobal(this.stack, fengari.to_luastring(name));
  }

  public setMetatable(metatable: LuaMetatable): void {
    this.pushMetatable(this.buildMetatableHandlers(metatable));
    fengari.lua.lua_setmetatable(this.stack, -2);
  }

  /** The chunk names a Lua message may blame, see {@link parseLuaErrorLocation}. */
  private chunkNames: readonly string[] = [];

  public knowChunks(names: readonly string[]): void {
    this.chunkNames = names;
  }

  /**
   * `nargs` values sit above `stackTop`, the traceback handler at `msgh`; the stack is left at
   * `stackTop` whether the call returned or threw, and a throw carries the message and the traceback
   * the handler appended.
   */
  private pcall(msgh: number, nargs: number, stackTop: number): unknown[] {
    const luaState = this.luaState;
    const ok =
      fengari.lua.lua_pcall(luaState, nargs, fengari.lua.LUA_MULTRET, msgh) === fengari.lua.LUA_OK;
    if (!ok) {
      const full = this.getErrorMessage();
      fengari.lua.lua_settop(luaState, stackTop);
      const nl = full.indexOf('\nstack traceback:');
      const message = nl === -1 ? full : full.slice(0, nl);
      throw new LuaError(
        `Runtime error: ${message}`,
        nl === -1 ? undefined : full.slice(nl + 1),
        this.chunkNames,
      );
    }
    const results: unknown[] = [];
    for (let i = msgh + 1; i <= fengari.lua.lua_gettop(luaState); i++) {
      results.push(this.getObject(i));
    }
    fengari.lua.lua_settop(luaState, stackTop);
    return results;
  }

  /**
   * Loads and runs `code` as a chunk named `chunkName` (shown in error messages
   * and tracebacks as "main.lua:12:"). Runtime errors carry the traceback
   * produced by debug.traceback so the console can show the call chain.
   */
  public evaluate(code: string, chunkName = MAIN_FILE): unknown[] {
    this.instructionsUsed = 0;

    const luaState = this.luaState;
    const stackTop = fengari.lua.lua_gettop(luaState);

    // Message handler: wraps the error with a traceback without altering the
    // original message (it stays first, so parseLuaErrorLocation keeps working).
    fengari.lua.lua_getglobal(luaState, fengari.to_luastring('debug'));
    fengari.lua.lua_getfield(luaState, -1, fengari.to_luastring('traceback'));
    fengari.lua.lua_remove(luaState, -2);
    const msgh = fengari.lua.lua_gettop(luaState);

    const loaded =
      fengari.lauxlib.luaL_loadbuffer(
        luaState,
        fengari.to_luastring(code),
        null,
        fengari.to_luastring(`=${chunkName}`),
      ) === fengari.lua.LUA_OK;

    if (!loaded) {
      const errorMessage = this.getErrorMessage();
      fengari.lua.lua_settop(luaState, stackTop);
      throw new LuaError(
        `Failed to load code fragment: ${errorMessage}`,
        undefined,
        this.chunkNames,
      );
    }

    return this.pcall(msgh, 0, stackTop);
  }

  /**
   * Calls the function sitting just above `stackTop`, with the traceback handler slid under it,
   * and leaves the stack at `stackTop` whether it returned or threw.
   */
  private callTop(stackTop: number, args: readonly unknown[]): unknown[] {
    const luaState = this.luaState;
    fengari.lua.lua_getglobal(luaState, fengari.to_luastring('debug'));
    fengari.lua.lua_getfield(luaState, -1, fengari.to_luastring('traceback'));
    fengari.lua.lua_remove(luaState, -2);
    fengari.lua.lua_insert(luaState, -2);
    const msgh = stackTop + 1;
    for (const arg of args) {
      this.pushObject(arg);
    }
    return this.pcall(msgh, args.length, stackTop);
  }

  /** Runs a named Lua global if it is a function, on a fresh instruction budget; null when absent. */
  public callGlobal(name: string, ...args: unknown[]): unknown[] | null {
    const luaState = this.luaState;
    const stackTop = fengari.lua.lua_gettop(luaState);
    fengari.lua.lua_getglobal(luaState, fengari.to_luastring(name));
    if (fengari.lua.lua_type(luaState, -1) !== fengari.lua.LUA_TFUNCTION) {
      fengari.lua.lua_settop(luaState, stackTop);
      return null;
    }
    this.instructionsUsed = 0;
    return this.callTop(stackTop, args);
  }

  /**
   * A named Lua global as something callable from here, or null when it is not a function.
   *
   * Unlike `callGlobal`, a call through it spends the budget of whatever `callGlobal` ran last:
   * the caller is what one step's budget covers, however many times it calls.
   */
  public getGlobalFunction(name: string): ((...args: unknown[]) => unknown[]) | null {
    const luaState = this.luaState;
    fengari.lua.lua_getglobal(luaState, fengari.to_luastring(name));
    if (fengari.lua.lua_type(luaState, -1) !== fengari.lua.LUA_TFUNCTION) {
      fengari.lua.lua_pop(luaState, 1);
      return null;
    }
    const push = fengari.lua.lua_toproxy(luaState, -1);
    fengari.lua.lua_pop(luaState, 1);
    return (...args) => {
      const stackTop = fengari.lua.lua_gettop(luaState);
      push(luaState);
      return this.callTop(stackTop, args);
    };
  }

  /** Releases the Lua state. The instance must not be used afterwards. */
  public close(): void {
    fengari.lua.lua_close(this.luaState);
  }
}

export { LuaEnvironment, LuaError };
