import { MAP_HEIGHT, MAP_WIDTH } from '../game/keys';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The `map` namespace. */
export class MapAPI extends EngineModule {
  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.setGlobalWith('map', {
      draw: (x: unknown, y: unknown, tx?: unknown, ty?: unknown, tw?: unknown, th?: unknown) => {
        ctx.gfx.drawMap(num(x), num(y), num(tx), num(ty), num(tw, MAP_WIDTH), num(th, MAP_HEIGHT));
      },
      get: (tx: unknown, ty: unknown) => ctx.data.getTile(Math.floor(num(tx)), Math.floor(num(ty))),
      set: (tx: unknown, ty: unknown, n: unknown) => {
        ctx.data.setTile(Math.floor(num(tx)), Math.floor(num(ty)), num(n));
      },
      flag: (n: unknown, bit?: unknown) =>
        bit === undefined
          ? ctx.data.getFlag(Math.floor(num(n)))
          : ctx.data.getFlagBit(Math.floor(num(n)), Math.floor(num(bit))),
      width: () => MAP_WIDTH,
      height: () => MAP_HEIGHT,
    });
  }
}
