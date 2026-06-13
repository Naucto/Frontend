import { LuaEnvironment } from "@lib/lua";
import { LuaAPI } from "@shared/lua-env-manager/api/API";

export class NetAPI extends LuaAPI {
  constructor(lua: LuaEnvironment) {
    super("net", lua);
  }

  public $host(): void {

  }

  public $list(): void {

  }
}
