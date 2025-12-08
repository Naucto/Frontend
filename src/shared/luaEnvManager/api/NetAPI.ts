import { LuaAPI } from "@shared/luaEnvManager/api/API";
import { LuaEnvironment } from "@lib/lua";

export class NetAPI extends LuaAPI {
  constructor(lua: LuaEnvironment) {
    super("net", lua);
  }

  public $host(): void {

  }

  public $list(): void {

  }
}
