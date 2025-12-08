import { LuaCallable, LuaEnvironment } from "@lib/lua.ts";

const LUA_METHOD_PREFIX = "$";

class LuaAPIMethodError implements Error {
  public name: string = "LuaAPIMethodError";

  constructor(public message: string = "", public stack: string = "") {}
}

export abstract class LuaAPI {
  protected constructor(name: string, protected _lua: LuaEnvironment) {
    const luaEntity = new Map<string, LuaCallable>();

    for (const propertyName of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
      if (!propertyName.startsWith(LUA_METHOD_PREFIX)) {
        continue;
      }

      const luaMethodName = propertyName
        .substring(LUA_METHOD_PREFIX.length)
        .replace(/([A-Z])/g, "_$1")
        .toLowerCase();

      const classRawMember = Reflect.get(this, propertyName);
      if (!classRawMember || !(propertyName in this)) {
        throw new LuaAPIMethodError(`Lua API method "${propertyName}" is not properly defined.`);
      }

      switch (typeof classRawMember) {
        case "function": {
          const classMember = classRawMember as LuaCallable;

          const luaCallable = classMember.bind(this) as LuaCallable;
          luaEntity.set(luaMethodName, luaCallable);

          break;
        }
      }
    }

    _lua.pushObject(luaEntity);
    _lua.setMetatable({
      "__index": this._indexAccess.bind(this)
    });
    _lua.setGlobal(name);
  }

  private _indexAccess(key: string): unknown {
    const camelKeyName = key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    const nativeKeyName = `${LUA_METHOD_PREFIX}${camelKeyName}`;

    return Reflect.get(this, nativeKeyName);
  }
}
