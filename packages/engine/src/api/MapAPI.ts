import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { luaNumber } from './lua-args';

/** A map as Lua names it -- counted from 1 in the order of the MAP tab's strip -- as an index. */
const mapAt = (m: unknown): number => Math.floor(luaNumber(m, 1)) - 1;

/** The `map` namespace. */
export class MapAPI extends EngineModule {
  /** One warning per call and map: a game asking every frame for a map it lacks says so once. */
  private readonly warned = new Set<string>();

  constructor(ctx: ApiContext) {
    super(ctx);
    const resolveMap = (fn: string, m: unknown): number => {
      const i = mapAt(m);
      const count = ctx.data.mapCount();
      if (i >= 0 && i < count) return i;
      const key = `${fn}:${String(i + 1)}`;
      if (!this.warned.has(key)) {
        this.warned.add(key);
        ctx.log(
          'warn',
          `map.${fn}: this game has ${String(count)} map(s), there is no map ${String(i + 1)}`,
        );
      }

      return -1;
    };
    ctx.lua.setGlobalWith('map', {
      draw: (
        x: unknown,
        y: unknown,
        tx?: unknown,
        ty?: unknown,
        tw?: unknown,
        th?: unknown,
        m?: unknown,
      ) => {
        const i = resolveMap('draw', m);
        if (i < 0) return;
        ctx.gfx.drawMap(
          luaNumber(x),
          luaNumber(y),
          luaNumber(tx),
          luaNumber(ty),
          luaNumber(tw, ctx.data.mapWidth(i)),
          luaNumber(th, ctx.data.mapHeight(i)),
          i,
        );
      },
      get: (tx: unknown, ty: unknown, m?: unknown) => {
        const i = resolveMap('get', m);

        return i < 0
          ? 0
          : ctx.data.getTile(Math.floor(luaNumber(tx)), Math.floor(luaNumber(ty)), i);
      },
      set: (tx: unknown, ty: unknown, n: unknown, m?: unknown) => {
        const i = resolveMap('set', m);
        if (i < 0) return;
        ctx.data.setTile(Math.floor(luaNumber(tx)), Math.floor(luaNumber(ty)), luaNumber(n), i);
      },
      flag: (n: unknown, bit?: unknown) =>
        bit === undefined
          ? ctx.data.getFlag(Math.floor(luaNumber(n)))
          : ctx.data.getFlagBit(Math.floor(luaNumber(n)), Math.floor(luaNumber(bit))),
      width: (m?: unknown) => {
        const i = resolveMap('width', m);

        return i < 0 ? 0 : ctx.data.mapWidth(i);
      },
      height: (m?: unknown) => {
        const i = resolveMap('height', m);

        return i < 0 ? 0 : ctx.data.mapHeight(i);
      },
    });
  }
}
