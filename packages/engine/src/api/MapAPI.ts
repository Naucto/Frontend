import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { defineLuaNamespace, luaFn, param } from './lua-namespace';

/** A map as Lua names it: counted from 1, in the order of the MAP tab's strip. */
const whichMap = param.index('m', { default: 1 });

export const MAP_API = defineLuaNamespace<MapAPI>('map', {
  draw: luaFn(
    {
      summary:
        'Draw a map (or a sub-rectangle of its tiles) at a pixel position. m picks the map, from 1.',
      params: [
        param.number('x'),
        param.number('y'),
        param.number('tx', { default: 0 }),
        param.number('ty', { default: 0 }),
        param.number('tw', { optional: true, defaultsTo: 'map.width(m)' }),
        param.number('th', { optional: true, defaultsTo: 'map.height(m)' }),
        whichMap,
      ],
      returns: null,
    },
    'draw',
  ),
  get: luaFn(
    {
      summary: 'Sprite index at a tile of map m (the first by default).',
      params: [param.int('tx'), param.int('ty'), whichMap],
      returns: 'number',
    },
    'get',
  ),
  set: luaFn(
    {
      summary: 'Change a tile of map m (the first by default) for this run only.',
      params: [param.int('tx'), param.int('ty'), param.number('n'), whichMap],
      returns: null,
    },
    'set',
  ),
  flag: luaFn(
    {
      summary: 'Flags byte of sprite n, or one bit of it.',
      params: [param.int('n'), param.int('bit', { optional: true })],
      returns: 'number|boolean',
    },
    'flag',
  ),
  width: luaFn(
    {
      summary: 'Width of map m (the first by default), in tiles.',
      params: [whichMap],
      returns: 'number',
    },
    'width',
  ),
  height: luaFn(
    {
      summary: 'Height of map m (the first by default), in tiles.',
      params: [whichMap],
      returns: 'number',
    },
    'height',
  ),
});

/** The `map` namespace. A map is addressed by its 0-based index, -1 being one the game lacks. */
export class MapAPI extends EngineModule {
  /** One warning per call and map: a game asking every frame for a map it lacks says so once. */
  private readonly warned = new Set<string>();

  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.registerNamespace(MAP_API, this);
  }

  private resolve(fn: string, map: number): number {
    const count = this.ctx.data.mapCount();
    if (map >= 0 && map < count) {
      return map;
    }
    const key = `${fn}:${String(map + 1)}`;
    if (!this.warned.has(key)) {
      this.warned.add(key);
      this.ctx.log(
        'warn',
        `map.${fn}: this game has ${String(count)} map(s), there is no map ${String(map + 1)}`,
      );
    }

    return -1;
  }

  /** `tw` and `th` left undefined cover the whole map. */
  draw(
    x: number,
    y: number,
    tx: number,
    ty: number,
    tw: number | undefined,
    th: number | undefined,
    map: number,
  ): void {
    const i = this.resolve('draw', map);
    if (i < 0) {
      return;
    }
    const data = this.ctx.data;
    this.ctx.gfx.drawMap(x, y, tx, ty, tw ?? data.mapWidth(i), th ?? data.mapHeight(i), i);
  }

  get(tx: number, ty: number, map: number): number {
    const i = this.resolve('get', map);

    return i < 0 ? 0 : this.ctx.data.getTile(tx, ty, i);
  }

  set(tx: number, ty: number, sprite: number, map: number): void {
    const i = this.resolve('set', map);
    if (i < 0) {
      return;
    }
    this.ctx.data.setTile(tx, ty, sprite, i);
  }

  /** The whole flags byte without a `bit`, that bit alone with one. */
  flag(sprite: number, bit: number | undefined): number | boolean {
    return bit === undefined
      ? this.ctx.data.getFlag(sprite)
      : this.ctx.data.getFlagBit(sprite, bit);
  }

  width(map: number): number {
    const i = this.resolve('width', map);

    return i < 0 ? 0 : this.ctx.data.mapWidth(i);
  }

  height(map: number): number {
    const i = this.resolve('height', map);

    return i < 0 ? 0 : this.ctx.data.mapHeight(i);
  }
}
