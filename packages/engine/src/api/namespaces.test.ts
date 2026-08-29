import { describe, expect, it } from 'vitest';

import { RecordingBackend } from '../gfx/RecordingBackend';
import type { DeclaredAction } from '../input/ActionMap';
import { InputState } from '../input/InputState';
import { LuaEnvironment } from '../vm/LuaEnvironment';
import type { ApiContext } from './ApiContext';
import { buildCompatPrelude } from './compatPrelude';
import { GfxAPI } from './GfxAPI';
import { InputAPI } from './InputAPI';
import { MapAPI } from './MapAPI';
import { SoundAPI } from './SoundAPI';
import { SysAPI } from './SysAPI';

function setup(): {
  lua: LuaEnvironment;
  gfx: RecordingBackend;
  input: InputState;
  logs: string[];
  tiles: Map<string, number>;
  declared: DeclaredAction[][];
} {
  const lua = new LuaEnvironment();
  const gfx = new RecordingBackend();
  const input = new InputState();
  const logs: string[] = [];
  const tiles = new Map<string, number>();
  const declared: DeclaredAction[][] = [];
  const ctx: ApiContext = {
    lua,
    gfx,
    input,
    data: {
      getFlag: (i) => (i === 3 ? 0b101 : 0),
      getFlagBit: (i, b) => i === 3 && (b === 0 || b === 2),
      getTile: (x, y) => tiles.get(`${String(x)},${String(y)}`) ?? 0,
      setTile: (x, y, n) => tiles.set(`${String(x)},${String(y)}`, n),
    },
    sys: { dt: 1 / 60, frame: () => 7, time: () => 0.5, fps: () => 60 },
    onActionsDeclared: (actions) => declared.push([...actions]),
    log: (level, text) => logs.push(`${level}:${text}`),
    print: (l) => logs.push(`log:${l}`),
  };
  new SysAPI(ctx);
  new GfxAPI(ctx);
  new MapAPI(ctx);
  new InputAPI(ctx);
  new SoundAPI(ctx);
  return { lua, gfx, input, logs, tiles, declared };
}

describe('Lua API namespaces', () => {
  it('input.declare names the actions the game uses, in engine order', () => {
    const { lua, declared, logs } = setup();
    lua.evaluate(
      'input.declare{ pause = "pause", a = "jump", left = "left", x = "action", nope = "bad" }',
      'main.lua',
    );
    expect(declared).toHaveLength(1);
    expect(declared[0]).toEqual([
      { action: 'left', label: 'left' },
      { action: 'a', label: 'jump' },
      { action: 'x', label: 'action' },
      { action: 'pause', label: 'pause' },
    ]);
    expect(logs).toContain('warn:input.declare: "nope" is not an action');
  });

  it('gfx forwards draw calls with defaults', () => {
    const { lua, gfx } = setup();
    lua.evaluate(
      'gfx.clear() gfx.draw_sprite(5, 10, 20) gfx.line(0, 0, 10, 10, 7) gfx.print("hi", 1, 2)',
    );
    expect(gfx.ops('clear')[0]?.args).toEqual([0]);
    expect(gfx.ops('drawSprite')[0]?.args).toEqual([5, 10, 20, 1, 1, false, false, 1]);
    expect(gfx.ops('line')[0]?.args).toEqual([0, 0, 10, 10, 7]);
    expect(gfx.ops('print')[0]?.args).toEqual(['hi', 1, 2, 5]);
  });

  it('gfx.scanline parses effect tables and scanline_fn calls once per row', () => {
    const { lua, gfx } = setup();
    lua.evaluate(
      'gfx.scanline(4, {shift_x = 3, wrap = true}) gfx.scanline_fn(function(y) if y < 2 then return {shift_y = y} end end)',
    );
    expect(gfx.ops('scanline').map((c) => c.args)).toEqual([
      [4, { shiftX: 3, wrap: true }],
      [0, { shiftY: 0 }],
      [1, { shiftY: 1 }],
    ]);
  });

  it('gfx.set_color accepts hex or rgb', () => {
    const { lua, gfx } = setup();
    lua.evaluate('gfx.set_color(1, "#ff0000") gfx.set_color(2, 0, 255, 16)');
    expect(gfx.ops('setColour').map((c) => c.args)).toEqual([
      [1, '#ff0000'],
      [2, '#00ff10'],
    ]);
  });

  it('map exposes tiles and flags', () => {
    const { lua, tiles } = setup();
    tiles.set('2,3', 9);
    const [n, f, bit, w] = lua.evaluate(
      'return map.get(2, 3), map.flag(3), map.flag(3, 1), map.width()',
    );
    expect([n, f, bit, w]).toEqual([9, 5, false, 128]);
    lua.evaluate('map.set(2, 3, 4)');
    expect(tiles.get('2,3')).toBe(4);
  });

  it('input reads actions per player and keys', () => {
    const { lua, input } = setup();
    input.setAction(0, 'left', true);
    input.setAction(1, 'a', true);
    input.setKey('ArrowUp', true);
    input.commit();
    const [l, a1, a2, k, bad] = lua.evaluate(
      'return input.btn("left"), input.btn("a"), input.btn("a", 2), input.key_pressed("ArrowUp"), input.btn("nope")',
    );
    expect([l, a1, a2, k, bad]).toEqual([true, false, true, true, false]);
    expect(lua.evaluate('return input.btnp("left")')[0]).toBe(true);
    input.commit();
    expect(lua.evaluate('return input.btnp("left")')[0]).toBe(false);
  });

  it('sys logs with levels and print goes to log', () => {
    const { lua, logs } = setup();
    lua.evaluate(
      'print("a", 1) sys.warn("w") sys.error("e") assert(sys.dt() > 0.016 and sys.frame() == 7)',
    );
    expect(logs).toEqual(['log:a\t1', 'warn:w', 'error:e']);
  });

  it('sound is a silent no-op without a backend', () => {
    const { lua } = setup();
    expect(() => lua.evaluate('sound.play_sfx(0) sound.play_music(1) sound.stop()')).not.toThrow();
    expect(lua.evaluate('return sound.is_playing(0)')[0]).toBe(false);
  });

  it('compat prelude maps legacy globals and warns once', () => {
    const { lua, gfx, logs } = setup();
    lua.evaluate(buildCompatPrelude(), 'compat.lua');
    lua.evaluate(
      'sprite(1, 2, 3) sprite(4, 5, 6) line(7, 0, 0, 10, 10) map(8, 9) mget(0, 0) fget(3, 2) clear(2)',
    );
    expect(gfx.ops('drawSprite')).toHaveLength(2);
    expect(gfx.ops('line')[0]?.args).toEqual([0, 0, 10, 10, 7]);
    expect(gfx.ops('drawMap')[0]?.args).toEqual([8, 9, 0, 0, 128, 32]);
    expect(logs.filter((l) => l.includes('sprite()'))).toHaveLength(1);
    expect(logs.some((l) => l.includes('map()'))).toBe(true);
  });

  it('reports structured errors with file and line', () => {
    const { lua } = setup();
    try {
      lua.evaluate('local x = 1\nerror("boom")', 'main.lua');
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ file: 'main.lua', line: 2 });
      expect((e as { traceback?: string }).traceback).toContain('stack traceback');
    }
  });
});
