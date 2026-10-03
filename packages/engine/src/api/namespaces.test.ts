import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../game/geometry';
import { RecordingBackend } from '../gfx/RecordingBackend';
import { InputState } from '../input/InputState';
import { LuaEnvironment } from '../vm/LuaEnvironment';
import { GfxAPI } from './GfxAPI';
import { InputAPI } from './InputAPI';
import { MapAPI } from './MapAPI';
import { NO_EFFECT, type SoundPort } from './ports';
import { SoundAPI } from './SoundAPI';
import { SysAPI } from './SysAPI';
import { makeApiContext } from './test-context';

function setup(): {
  lua: LuaEnvironment;
  gfx: RecordingBackend;
  gfxApi: GfxAPI;
  input: InputState;
  logs: string[];
  tiles: Map<string, number>;
} {
  const lua = new LuaEnvironment();
  const gfx = new RecordingBackend();
  const input = new InputState();
  const logs: string[] = [];
  const tiles = new Map<string, number>();
  const ctx = makeApiContext(lua, {
    gfx,
    input,
    // Two maps: the first at the default geometry, a second sixteen tiles square.
    data: {
      mapCount: () => 2,
      mapWidth: (map) => (map === 1 ? 16 : DEFAULT_GEOMETRY.mapWidth),
      mapHeight: (map) => (map === 1 ? 16 : DEFAULT_GEOMETRY.mapHeight),
      getFlag: (i) => (i === 3 ? 0b101 : 0),
      getFlagBit: (index, bit) => index === 3 && (bit === 0 || bit === 2),
      getTile: (x, y, map) => tiles.get(`${String(map)}:${String(x)},${String(y)}`) ?? 0,
      setTile: (x, y, sprite, map) => tiles.set(`${String(map)}:${String(x)},${String(y)}`, sprite),
    },
    sys: { dt: 1 / 60, frame: () => 7, time: () => 0.5, fps: () => 60 },
    log: (level, text) => logs.push(`${level}:${text}`),
    print: (text) => logs.push(`log:${text}`),
  });
  new SysAPI(ctx);
  const gfxApi = new GfxAPI(ctx);
  new MapAPI(ctx);
  new InputAPI(ctx);
  new SoundAPI(ctx);
  return { lua, gfx, gfxApi, input, logs, tiles };
}

/** One beam pass over the */
function beam(lua: LuaEnvironment, gfxApi: GfxAPI): void {
  const fn = lua.getGlobalFunction('_scanline');
  if (!fn) {
    throw new Error('no _scanline');
  }
  gfxApi.beam(fn);
}

describe('Lua API namespaces', () => {
  it('gfx forwards draw calls with defaults', () => {
    const { lua, gfx } = setup();
    lua.evaluate(
      'gfx.clear() gfx.draw_sprite(5, 10, 20) gfx.line(0, 0, 10, 10, 7) gfx.print("hi", 1, 2)',
    );
    expect(gfx.ops('clear')[0]?.args).toEqual([0]);
    expect(gfx.ops('drawSprite')[0]?.args).toEqual([5, 10, 20, 1, 1, false, false, 1, 0]);
    expect(gfx.ops('line')[0]?.args).toEqual([0, 0, 10, 10, 7]);
    expect(gfx.ops('print')[0]?.args).toEqual(['hi', 1, 2, 5]);
  });

  it('takes calls from inside a coroutine, which runs on a stack of its own', () => {
    const { lua, gfx, logs } = setup();
    lua.evaluate("coroutine.wrap(function() print('x'); gfx.clear(1) end)()");
    expect(logs).toEqual(['log:x']);
    expect(gfx.ops('clear')[0]?.args).toEqual([1]);
    expect(
      lua.evaluate('return coroutine.wrap(function() return gfx.width() + sys.frame() end)()'),
    ).toEqual([327]);
  });

  it('gfx.draw_sprite reads the colour it keeps clear from what was actually passed', () => {
    const { lua, gfx } = setup();
    lua.evaluate(
      'gfx.draw_sprite(5, 0, 0) gfx.draw_sprite(5, 0, 0, 1, 1, false, false, 1, 7) ' +
        'gfx.draw_sprite(5, 0, 0, 1, 1, false, false, 1, nil)',
    );
    expect(gfx.ops('drawSprite').map((call) => call.args.at(-1))).toEqual([0, 7, null]);
  });

  it('gfx palette, shift and blank calls set the frame outside the beam pass', () => {
    const { lua, gfx } = setup();
    lua.evaluate(
      'gfx.set_color(1, "FF0000") gfx.screen_col(3, 1) gfx.shift(2, -1, true) gfx.blank() gfx.blank(false)',
    );
    expect(gfx.ops('setColour').map((call) => call.args)).toEqual([[1, '#ff0000']]);
    expect(gfx.ops('screenCol').map((call) => call.args)).toEqual([[3, 1]]);
    expect(lua.evaluate('return gfx.get_color(3)')).toEqual(['#ff0000']);
    expect(gfx.ops('setFrameEffect').map((call) => call.args[0])).toEqual([
      { shiftX: 2, shiftY: -1, wrap: true, blank: false },
      { shiftX: 2, shiftY: -1, wrap: true, blank: true },
      { shiftX: 2, shiftY: -1, wrap: true, blank: false },
    ]);
    expect(gfx.ops('setLineEffect')).toHaveLength(0);
    expect(gfx.ops('setLinePalette')).toHaveLength(0);
  });

  it('inside _scanline, set_color changes the line and the ones below it until changed again', () => {
    const { lua, gfx, gfxApi } = setup();
    lua.evaluate(
      'gfx.set_color(0, "#111111")\n' +
        'function _scanline(y)\n' +
        '  if y == 10 then gfx.set_color(0, "#ff0000") end\n' +
        '  if y == 15 then gfx.screen_col(1, 0) end\n' +
        '  if y == 20 then gfx.reset_palette() end\n' +
        'end',
    );
    beam(lua, gfxApi);
    const rows = gfx.ops('setLinePalette');
    expect(rows.map((call) => call.args[0])).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(rows.map((call) => (call.args[1] as string[]).slice(0, 2))).toEqual([
      ...Array.from({ length: 5 }, () => ['#ff0000', '#000000']),
      ...Array.from({ length: 5 }, () => ['#ff0000', '#ff0000']),
    ]);
    // The frame palette was written once, in the code before the pass; the beam never touches it.
    expect(gfx.ops('setColour')).toHaveLength(1);
    expect(gfx.ops('resetPalette')).toHaveLength(0);
    expect(gfx.ops('setLineEffect')).toHaveLength(180);
    expect(lua.evaluate('return gfx.get_color(0)')).toEqual(['#111111']);
  });

  it('inside _scanline, shift and blank set the line and carry down; the next pass starts over', () => {
    const { lua, gfx, gfxApi } = setup();
    lua.evaluate(
      'gfx.shift(1)\n' +
        'function _scanline(y)\n' +
        '  if y == 100 then gfx.shift(3, 0, true) end\n' +
        '  if y == 150 then gfx.blank() end\n' +
        '  if y == 170 then gfx.blank(false) gfx.shift(0, 0) end\n' +
        'end',
    );
    beam(lua, gfxApi);
    const fx = gfx.ops('setLineEffect').map((call) => call.args[1]);
    expect(fx[0]).toEqual({ ...NO_EFFECT, shiftX: 1 });
    expect(fx[99]).toEqual({ ...NO_EFFECT, shiftX: 1 });
    expect(fx[100]).toEqual({ ...NO_EFFECT, shiftX: 3, wrap: true });
    expect(fx[149]).toEqual({ ...NO_EFFECT, shiftX: 3, wrap: true });
    expect(fx[150]).toEqual({ ...NO_EFFECT, shiftX: 3, wrap: true, blank: true });
    expect(fx[169]).toEqual({ ...NO_EFFECT, shiftX: 3, wrap: true, blank: true });
    expect(fx[170]).toEqual(NO_EFFECT);
    expect(fx[179]).toEqual(NO_EFFECT);
    expect(gfx.ops('setFrameEffect')).toHaveLength(1);

    gfx.calls.length = 0;
    beam(lua, gfxApi);
    expect(gfx.ops('setLineEffect')[0]?.args).toEqual([0, { ...NO_EFFECT, shiftX: 1 }]);
  });

  it('gfx.set_color accepts hex or rgb', () => {
    const { lua, gfx } = setup();
    lua.evaluate('gfx.set_color(1, "#ff0000") gfx.set_color(2, 0, 255, 16)');
    expect(gfx.ops('setColour').map((call) => call.args)).toEqual([
      [1, '#ff0000'],
      [2, '#00ff10'],
    ]);
  });

  it('map exposes tiles and flags', () => {
    const { lua, tiles } = setup();
    tiles.set('0:2,3', 9);
    const [tile, flag, bit, width] = lua.evaluate(
      'return map.get(2, 3), map.flag(3), map.flag(3, 1), map.width()',
    );
    expect([tile, flag, bit, width]).toEqual([9, 5, false, 128]);
    lua.evaluate('map.set(2, 3, 4)');
    expect(tiles.get('0:2,3')).toBe(4);
  });

  it('map takes the map number last, counted from one', () => {
    const { lua, tiles, gfx } = setup();
    tiles.set('1:2,3', 9);
    const [tile, width, height] = lua.evaluate(
      'return map.get(2, 3, 2), map.width(2), map.height(2)',
    );
    expect([tile, width, height]).toEqual([9, 16, 16]);
    lua.evaluate('map.set(2, 3, 4, 2)');
    expect(tiles.get('1:2,3')).toBe(4);
    expect(tiles.get('0:2,3')).toBeUndefined();

    lua.evaluate('map.draw(0, 0)');
    lua.evaluate('map.draw(0, 0, 0, 0, 4, 4, 2)');
    expect(gfx.ops('drawMap').map((call) => call.args)).toEqual([
      [0, 0, 0, 0, 128, 32, 0],
      [0, 0, 0, 0, 4, 4, 1],
    ]);
  });

  it('map answers nothing for a map the game lacks, and says so once', () => {
    const { lua, logs, gfx } = setup();
    const [width, tile] = lua.evaluate('return map.width(9), map.get(0, 0, 9)');
    lua.evaluate('map.width(9)');
    lua.evaluate('map.draw(0, 0, 0, 0, 4, 4, 9)');
    expect([width, tile]).toEqual([0, 0]);
    expect(gfx.ops('drawMap')).toHaveLength(0);
    expect(logs.filter((line) => line.startsWith('warn:map.width'))).toHaveLength(1);
    expect(logs).toContain('warn:map.width: this game has 2 map(s), there is no map 9');
  });

  it('input reads actions per player and keys', () => {
    const { lua, input } = setup();
    input.setAction(0, 'left', true);
    input.setAction(1, 'a', true);
    input.setKey('ArrowUp', true);
    input.commit();
    const [left, a1, a2, keyPressed, bad] = lua.evaluate(
      'return input.held("left"), input.held("a"), input.held("a", 2), input.key_pressed("ArrowUp"), input.held("nope")',
    );
    expect([left, a1, a2, keyPressed, bad]).toEqual([true, false, true, true, false]);
    expect(lua.evaluate('return input.pressed("left")')[0]).toBe(true);
    input.commit();
    expect(lua.evaluate('return input.pressed("left")')[0]).toBe(false);
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

  it('prints a table nested within what the host can take', () => {
    const { lua, logs } = setup();
    lua.evaluate('local t = {} local c = t for i = 1, 8 do c.n = {} c = c.n end print(t)');
    expect(logs).toHaveLength(1);
  });

  it('prints a table that repeats one of its own children', () => {
    const { lua, logs } = setup();
    lua.evaluate('local s = { x = 1 } print({ a = s, b = s })');
    expect(logs).toEqual(['log:{"a":{"x":1},"b":{"x":1}}']);
  });

  it('says a table is too deep to read rather than dying on the host stack', () => {
    const { lua } = setup();
    expect(() =>
      lua.evaluate('local t = {} local c = t for i = 1, 40 do c.n = {} c = c.n end print(t)'),
    ).toThrow(/nested deeper/);
  });

  it('says a table contains itself rather than walking it forever', () => {
    const { lua } = setup();
    expect(() => lua.evaluate('local t = { name = "root" } t.parent = t print(t.parent)')).toThrow(
      /contains itself/,
    );
  });

  it('reports structured errors with file and line', () => {
    const { lua } = setup();
    try {
      lua.knowChunks(['main']);
      lua.evaluate('local x = 1\nerror("boom")', 'main');
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ file: 'main', line: 2 });
      expect((error as { traceback?: string }).traceback).toContain('stack traceback');
    }
  });
});

describe('sound overrides', () => {
  /** A port that keeps what it was asked to change, and knows one instrument and no pattern. */
  function setupSound(): { lua: LuaEnvironment; logs: string[]; patches: unknown[] } {
    const lua = new LuaEnvironment();
    const logs: string[] = [];
    const patches: unknown[] = [];
    const sound = {
      setInstrumentOverride: (name: string, patch: unknown) => {
        patches.push(patch);
        return name === 'lead';
      },
      setPatternOverride: (slot: number, patch: unknown) => {
        patches.push(patch);
        return false;
      },
      setSongOverride: () => true,
    } as unknown as SoundPort;
    const ctx = makeApiContext(lua, {
      sound,
      sys: { dt: 1 / 60, frame: () => 0, time: () => 0, fps: () => 60 },
      log: (level, text) => logs.push(`${level}:${text}`),
    });
    new SoundAPI(ctx);
    return { lua, logs, patches };
  }

  it('set_instrument keeps each field in its range and maps it to the model', () => {
    const { lua, logs, patches } = setupSound();
    lua.evaluate(
      'sound.set_instrument("lead", { duty = 2, attack = -1, vibrato_rate = 3, filter = "lp", osc = "saw", cutoff = 99999 })',
    );
    expect(patches).toEqual([
      {
        duty: 0.95,
        env: { attack: 0 },
        vibrato: { rate: 3 },
        filter: { type: 'lp', cutoff: 12000 },
        osc: 'saw',
      },
    ]);
    expect(logs).toEqual([]);
  });

  it('set_instrument says once what it does not know', () => {
    const { lua, logs } = setupSound();
    lua.evaluate('for i = 1, 3 do sound.set_instrument("lead", { colour = 3, osc = "organ" }) end');
    lua.evaluate('sound.set_instrument("bass", {})');
    expect(logs).toEqual([
      'warn:sound.set_instrument: "colour" is not an instrument field',
      'warn:sound.set_instrument: osc is one of square, sine, triangle, saw, noise, sample',
      'warn:sound.set_instrument: there is no instrument called "bass"',
    ]);
  });

  it('set_pattern on a number no pattern has warns and changes nothing', () => {
    const { lua, logs, patches } = setupSound();
    lua.evaluate('sound.set_pattern(7, { bpm = 300 }) sound.set_pattern(7, { bpm = 300 })');
    expect(patches).toEqual([{ bpm: 240 }, { bpm: 240 }]);
    expect(logs).toEqual(['warn:sound.set_pattern: there is no pattern 7']);
  });
});
