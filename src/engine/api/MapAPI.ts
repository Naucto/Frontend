import { ApiContext } from "./ApiContext";
import { EngineModule } from "./EngineModule";

export class MapAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.setGlobalWith("map", this._map.bind(this));
    ctx.lua.setGlobalWith("mget", this._mget.bind(this));
    ctx.lua.setGlobalWith("fget", this._fget.bind(this));
  }

  private _map(x: number, y: number): void {
    this.ctx.renderer.drawMap(x, y);
  }

  private _mget(x: number, y: number): number {
    return this.ctx.maps.getTileAt({ x, y });
  }

  private _fget(spriteIndex: number, bit?: number): boolean | number {
    if (bit === undefined) {
      return this.ctx.sprites.getFlag(spriteIndex);
    }
    return this.ctx.sprites.getFlagBit(spriteIndex, bit);
  }
}
