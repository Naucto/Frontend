// @ts-expect-error This is a pure JS library.
import fengari from "fengari";

export type LuaCallable = (...args: unknown[]) => unknown;
export type LuaMetatable = {
  __index?: LuaCallable | Record<string, unknown>;
  __newindex?: (table: unknown, key: string, value: unknown) => void;
  __call?: (table: unknown, ...args: unknown[]) => unknown;
  __tostring?: (table: unknown) => string;
  __len?: (table: unknown) => number;
  __unm?: (table: unknown) => unknown;
  __add?: (left: unknown, right: unknown) => unknown;
  __sub?: (left: unknown, right: unknown) => unknown;
  __mul?: (left: unknown, right: unknown) => unknown;
  __div?: (left: unknown, right: unknown) => unknown;
  __mod?: (left: unknown, right: unknown) => unknown;
  __pow?: (left: unknown, right: unknown) => unknown;
  __concat?: (left: unknown, right: unknown) => unknown;
  __eq?: (left: unknown, right: unknown) => boolean;
  __lt?: (left: unknown, right: unknown) => boolean;
  __le?: (left: unknown, right: unknown) => boolean;
  __gc?: (table: unknown) => void;
  __mode?: "k" | "v" | "kv";
  __metatable?: unknown;
  __pairs?: (table: unknown) => [LuaCallable, unknown, unknown];
  __ipairs?: (table: unknown) => [LuaCallable, unknown, number];
}

class LuaError extends Error {
  constructor(message: string) {
    super(message);
  }
}

class LuaEnvironment {
  _L: fengari.lua.lua_State;

  constructor() {
    this._L = fengari.lauxlib.luaL_newstate();
    fengari.lualib.luaL_openlibs(this._L);
  }

  private _getErrorMessage(): string {
    const errorMessage = fengari.to_jsstring(fengari.lua.lua_tostring(this._L, -1));
    fengari.lua.lua_pop(this._L, 1);

    return errorMessage;
  }

  public getObject(index: number): unknown {
    let value: unknown;

    switch (fengari.lua.lua_type(this._L, index)) {
      case fengari.lua.LUA_TBOOLEAN:
        value = fengari.lua.lua_toboolean(this._L, index) !== 0;
        break;

      case fengari.lua.LUA_TNUMBER:
        value = fengari.lua.lua_tonumber(this._L, index);
        break;

      case fengari.lua.LUA_TSTRING:
        value = fengari.to_jsstring(fengari.lua.lua_tostring(this._L, index));
        break;

      case fengari.lua.LUA_TTABLE:
        fengari.lua.lua_pushnil(this._L);
        while (fengari.lua.lua_next(this._L, index) !== 0) {
          const key = this.getObject(-2);
          const val = this.getObject(-1);

          (value as Record<string, unknown>)[String(key)] = val;

          fengari.lua.lua_pop(this._L, 1);
        }

        break;

      case fengari.lua.LUA_TFUNCTION: {
        const func = fengari.lua.lua_toproxy(this._L, index);

        value = (...args: unknown[]): unknown => {
          const stackTop = fengari.lua.lua_gettop(this._L);

          func(this._L);
          args.forEach(this.pushObject);

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
        fengari.lua.lua_pushboolean(this._L, value);
        break;

      case "number":
        fengari.lua.lua_pushnumber(this._L, value);
        break;

      case "string":
        fengari.lua.lua_pushstring(this._L, fengari.to_luastring(value));
        break;

      case "object":
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
          switch (typeof returnValues) {
            case "boolean":
              fengari.lua.lua_pushboolean(state, returnValues ? 1 : 0);
              return 1;

            case "number":
              fengari.lua.lua_pushnumber(state, returnValues);
              return 1;

            case "string":
              fengari.lua.lua_pushstring(state, fengari.to_luastring(returnValues));
              return 1;

            case "object":
              if (Array.isArray(returnValues)) {
                returnValues.forEach(this.pushObject);
                return returnValues.length;
              }
              break;

            case "function":
              fengari.lua.lua_pushjsfunction(this._L, value);
              break;

            case "undefined":
              fengari.lua.lua_pushnil(state);
              return 1;

            default:
              return 0;
          }
        });
        break;

      case "undefined":
        fengari.lua.lua_pushnil(this._L);
        break;

      default:
        throw new LuaError(`Unsupported JavaScript type ${typeof value}`);
    }
  }

  public setGlobalWith(name: string, value: unknown): void {
    this.pushObject(value);
    this.setGlobal(name);
  }

  public setGlobal(name: string): void {
    fengari.lua.lua_setglobal(this._L, fengari.to_luastring(name));
  }

  public setMetatable(metatable: LuaMetatable): void {
    this.pushObject(metatable);
    fengari.lua.lua_setmetatable(this._L, -2);
  }

  public evaluate(code: string): unknown[] {
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
