// @ts-expect-error This is a pure JS library.
import fengari from "fengari";

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

export const LUA_PROXY: unique symbol = Symbol("LuaProxy");

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
  { meta: "__index", method: "index", argStart: 2, argCount: 1, pushResult: true },
  { meta: "__newindex", method: "newindex", argStart: 2, argCount: 2, pushResult: false },
  { meta: "__call", method: "call", argStart: 2, pushResult: true },
  { meta: "__tostring", method: "tostring", argStart: 1, argCount: 0, pushResult: true },
  { meta: "__len", method: "len", argStart: 1, argCount: 0, pushResult: true },
  { meta: "__unm", method: "unm", argStart: 1, argCount: 1, pushResult: true },
  { meta: "__add", method: "add", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__sub", method: "sub", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__mul", method: "mul", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__div", method: "div", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__mod", method: "mod", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__pow", method: "pow", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__concat", method: "concat", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__eq", method: "eq", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__lt", method: "lt", argStart: 1, argCount: 2, pushResult: true },
  { meta: "__le", method: "le", argStart: 1, argCount: 2, pushResult: true },
];

const isLuaProxy = (value: unknown): value is LuaProxy =>
  typeof value === "object" && value !== null && (value as Record<symbol, unknown>)[LUA_PROXY] === true;

class LuaError extends Error {
  constructor(message: string) {
    super(message);
  }
}
const HOOK_INTERVAL = 100_000;
const INSTRUCTION_LIMIT = 10_000_000;

class LuaEnvironment {
  _L: fengari.lua.lua_State;
  private _instructionsUsed = 0;

  constructor() {
    this._L = fengari.lauxlib.luaL_newstate();
    fengari.lualib.luaL_openlibs(this._L);
    this._installInstructionGuard();
  }

  /**
   * Installs a count hook that aborts execution after INSTRUCTION_LIMIT
   * instructions within a single evaluation. This turns otherwise-fatal
   * infinite loops and runaway recursion into a normal runtime error that the
   * caller can catch and report, rather than a hung tab.
   */
  private _installInstructionGuard(): void {
    const hook = (L: fengari.lua.lua_State): void => {
      this._instructionsUsed += HOOK_INTERVAL;
      if (this._instructionsUsed > INSTRUCTION_LIMIT) {
        fengari.lauxlib.luaL_error(
          L,
          fengari.to_luastring(
            "execution aborted: possible infinite loop or recursion"
          )
        );
      }
    };

    fengari.lua.lua_sethook(this._L, hook, fengari.lua.LUA_MASKCOUNT, HOOK_INTERVAL);
  }

  private _getErrorMessage(): string {
    const raw = fengari.lua.lua_tostring(this._L, -1);
    const typeName = fengari.to_jsstring(fengari.lua.lua_typename(this._L, fengari.lua.lua_type(this._L, -1)));
    fengari.lua.lua_pop(this._L, 1);

    return raw ? fengari.to_jsstring(raw) : `non-string error (${typeName})`;
  }

  public getObject(index: number): unknown {
    let value: unknown;

    switch (fengari.lua.lua_type(this._L, index)) {
      case fengari.lua.LUA_TNIL:
      case fengari.lua.LUA_TNONE:
        value = undefined;
        break;

      case fengari.lua.LUA_TBOOLEAN:
        value = Boolean(fengari.lua.lua_toboolean(this._L, index));
        break;

      case fengari.lua.LUA_TNUMBER:
        value = fengari.lua.lua_tonumber(this._L, index);
        break;

      case fengari.lua.LUA_TSTRING:
        value = fengari.to_jsstring(fengari.lua.lua_tostring(this._L, index));
        break;

      case fengari.lua.LUA_TTABLE: {
        // lua_next needs an absolute index: pushing the iteration key shifts a
        // relative (negative) index and corrupts nested-table marshalling.
        const tableIndex = index < 0 ? fengari.lua.lua_gettop(this._L) + index + 1 : index;
        const table: Record<string, unknown> = {};

        fengari.lua.lua_pushnil(this._L);
        while (fengari.lua.lua_next(this._L, tableIndex) !== 0) {
          table[String(this.getObject(-2))] = this.getObject(-1);
          fengari.lua.lua_pop(this._L, 1);
        }

        value = table;
        break;
      }

      case fengari.lua.LUA_TFUNCTION: {
        const func = fengari.lua.lua_toproxy(this._L, index);

        value = (...args: unknown[]): unknown => {
          const stackTop = fengari.lua.lua_gettop(this._L);

          func(this._L);
          args.forEach(arg => this.pushObject(arg));

          const success = fengari.lua.lua_pcall(this._L, args.length, fengari.lua.LUA_MULTRET, 0) === fengari.lua.LUA_OK;

          if (!success) {
            const errorMessage = this._getErrorMessage();
            throw new LuaError(`Runtime error: ${errorMessage}`);
          }

          const results: unknown[] = [];
          for (let i = stackTop + 1; i <= fengari.lua.lua_gettop(this._L); i++)
            results.push(this.getObject(i));

          return results;
        };

        break;

      }
      default: {
        const typeName = fengari.to_jsstring(fengari.lua.lua_typename(this._L, fengari.lua.lua_type(this._L, index)));
        throw new LuaError(`Unsupported Lua type ${typeName}`);
      }
    }

    return value;
  }

  public pushObject(value: unknown): void {
    if (value === null) {
      value = undefined;
    }

    switch (typeof value) {
      case "boolean":
        fengari.lua.lua_pushboolean(this._L, value ? 1 : 0);
        break;

      case "number":
        fengari.lua.lua_pushnumber(this._L, value);
        break;

      case "string":
        fengari.lua.lua_pushstring(this._L, fengari.to_luastring(value));
        break;

      case "object":
        if (isLuaProxy(value)) {
          this._pushProxy(value);
          break;
        }

        if (Array.isArray(value)) {
          fengari.lua.lua_createtable(this._L, value.length, 0);

          value.forEach((v, i) => {
            this.pushObject(v);
            fengari.lua.lua_rawseti(this._L, -2, i + 1);
          });
        } else {
          // Assume this is a map-like object

          fengari.lua.lua_createtable(this._L, 0, 0);

          Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
            this.pushObject(k);
            this.pushObject(v);
            fengari.lua.lua_settable(this._L, -3);
          });
        }

        break;

      case "function":
        fengari.lua.lua_pushjsfunction(this._L, (state: fengari.lua_State) => {
          const args = Array.from({ length: fengari.lua.lua_gettop(state) }, (_, i) => this.getObject(i + 1));

          while (fengari.lua.lua_gettop(state) > 0)
            fengari.lua.lua_remove(state, 1);

          const returnValues = value(...args);

          // An array becomes multiple Lua return values; anything else (scalar,
          // table, proxy, nil) is one value marshalled through pushObject.
          if (Array.isArray(returnValues)) {
            returnValues.forEach(entry => this.pushObject(entry));
            return returnValues.length;
          }

          this.pushObject(returnValues);
          return 1;
        });
        break;

      case "undefined":
        fengari.lua.lua_pushnil(this._L);
        break;

      default:
        throw new LuaError(`Unsupported JavaScript type ${typeof value}`);
    }
  }

  public pushBridgedTable(handlers: Record<string, MetamethodHandler>): void {
    fengari.lua.lua_createtable(this._L, 0, 0);
    this._pushMetatable(handlers);
    fengari.lua.lua_setmetatable(this._L, -2);
  }

  private _pushProxy(proxy: LuaProxy): void {
    this.pushBridgedTable(this._buildMetatableHandlers(proxy));
  }

  // Pushes only the metatable, so pushBridgedTable (new table) and setMetatable
  // (existing top table) share one metamethod-wiring path.
  private _pushMetatable(handlers: Record<string, MetamethodHandler>): void {
    const L = this._L;
    fengari.lua.lua_createtable(L, 0, 0);

    for (const meta of Object.keys(handlers)) {
      const handler = handlers[meta]!;

      fengari.lua.lua_pushjsfunction(L, (state: fengari.lua_State) => {
        // A JS throw escaping into fengari surfaces as an opaque non-string error,
        // so convert it into a proper Lua error carrying the message.
        try {
          const top = fengari.lua.lua_gettop(state);
          const args: unknown[] = [];
          for (let i = 1; i <= top; i++)
            args.push(this.getObject(i));

          const results = handler(args);
          for (const value of results)
            this.pushObject(value);

          return results.length;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return fengari.lauxlib.luaL_error(state, fengari.to_luastring(message));
        }
      });

      fengari.lua.lua_setfield(L, -2, fengari.to_luastring(meta));
    }
  }

  private _buildMetatableHandlers(meta: LuaMetatable): Record<string, MetamethodHandler> {
    const handlers: Record<string, MetamethodHandler> = {};

    for (const spec of METAMETHOD_SPECS) {
      const method = meta[spec.method];

      if (typeof method !== "function")
        continue;

      handlers[spec.meta] = (args: unknown[]): unknown[] => {
        const start = spec.argStart - 1;
        const slice = spec.argCount === undefined
          ? args.slice(start)
          : args.slice(start, start + spec.argCount);
        const result = (method as (...a: unknown[]) => unknown).apply(meta, slice);

        return spec.pushResult ? [result] : [];
      };
    }

    if (meta.keys)
      handlers["__pairs"] = this._pairsHandler(meta);

    return handlers;
  }

  private _pairsHandler(meta: LuaMetatable): MetamethodHandler {
    return (): unknown[] => {
      const keys = meta.keys!();
      let cursor = 0;

      const iterator = (): unknown => {
        if (cursor >= keys.length)
          return undefined;

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

  public setGlobal(name: string): void {
    fengari.lua.lua_setglobal(this._L, fengari.to_luastring(name));
  }

  public setMetatable(metatable: LuaMetatable): void {
    this._pushMetatable(this._buildMetatableHandlers(metatable));
    fengari.lua.lua_setmetatable(this._L, -2);
  }

  public evaluate(code: string): unknown[] {
    this._instructionsUsed = 0;

    const stackTop = fengari.lua.lua_gettop(this._L);

    let success = fengari.lauxlib.luaL_loadstring(this._L, fengari.to_luastring(code)) === fengari.lua.LUA_OK;

    if (!success) {
      const errorMessage = this._getErrorMessage();
      throw new LuaError(`Failed to load code fragment: ${errorMessage}`);
    }

    success = fengari.lua.lua_pcall(this._L, 0, fengari.lua.LUA_MULTRET, 0) === fengari.lua.LUA_OK;

    if (!success) {
      const errorMessage = this._getErrorMessage();
      throw new LuaError(`Runtime error: ${errorMessage}`);
    }

    const results: unknown[] = [];
    for (let i = stackTop + 1; i <= fengari.lua.lua_gettop(this._L); i++)
      results.push(this.getObject(i));

    return results;
  }
}

export {
  LuaEnvironment,
  LuaError
};
