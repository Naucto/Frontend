import { ApiContext } from "./ApiContext";
import { EngineModule } from "./EngineModule";

export class InputAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.setGlobalWith("key_pressed", this._keyPressed.bind(this));
  }

  private _keyPressed(key: string): boolean {
    return this.ctx.input.isKeyPressed(key);
  }
}
