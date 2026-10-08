import { describe, expect, it } from 'vitest';

import { type LuaCallable, LuaEnvironment } from '../vm/LuaEnvironment';
import { defineLuaNamespace, luaFn, type LuaParam, luaValue, param } from './lua-namespace';
import { LUA_API, type LuaApiEntry } from './luaApiTable';

/** Each call's converted arguments, as the method received them. */
class Recorder {
  readonly calls: unknown[][] = [];

  numbers(...values: [number, number, number, number | undefined]): void {
    this.calls.push(values);
  }

  ints(...values: [number, number]): void {
    this.calls.push(values);
  }

  truth(...values: [boolean, boolean | undefined]): void {
    this.calls.push(values);
  }

  text(...values: [string, Readonly<Record<string, unknown>>]): void {
    this.calls.push(values);
  }

  presence(key: string): void {
    this.calls.push([key]);
  }

  varargs(first: string, rest: unknown[]): void {
    this.calls.push([first, rest]);
  }

  callback(callback: LuaCallable): void {
    this.calls.push([callback()]);
  }

  pair(): number[] {
    return [1, 2];
  }

  answer(): number {
    return 42;
  }
}

const given: LuaParam<string> = {
  name: 'key',
  type: 'number',
  optional: true,
  read: (value, wasGiven) => (wasGiven ? `given ${String(value)}` : 'left out'),
};

const TEST_API = defineLuaNamespace<Recorder>('test', {
  numbers: luaFn(
    {
      summary: '',
      params: [
        param.number('a'),
        param.number('b', { fallback: -1 }),
        param.number('c', { default: 5 }),
        param.number('d', { optional: true }),
      ],
      returns: null,
    },
    'numbers',
  ),
  ints: luaFn(
    {
      summary: '',
      params: [param.int('n'), param.index('m', { default: 1 })],
      returns: null,
    },
    'ints',
  ),
  truth: luaFn(
    {
      summary: '',
      params: [param.bool('on', { default: true }), param.bool('loop', { optional: true })],
      returns: null,
    },
    'truth',
  ),
  text: luaFn(
    { summary: '', params: [param.string('text'), param.table('fields')], returns: null },
    'text',
  ),
  presence: luaFn({ summary: '', params: [given], returns: null }, 'presence'),
  varargs: luaFn(
    { summary: '', params: [param.string('first'), param.rest()], returns: null },
    'varargs',
  ),
  callback: luaFn({ summary: '', params: [param.function('callback')], returns: null }, 'callback'),
  pair: luaFn({ summary: '', params: [], returns: 'number|nil' }, 'pair'),
  answer: luaValue({ summary: '', type: 'number' }, 'answer'),
});

const mount = (): { lua: LuaEnvironment; recorder: Recorder } => {
  const lua = new LuaEnvironment();
  const recorder = new Recorder();
  lua.registerNamespace(TEST_API, recorder);
  return { lua, recorder };
};

describe('LuaEnvironment.registerNamespace', () => {
  it('reads a required number as 0, or its fallback, and an optional one as its default', () => {
    const { lua, recorder } = mount();
    lua.evaluate('test.numbers() test.numbers(1, 2, 3, 4) test.numbers("x", {}, nil, 0/0)');
    expect(recorder.calls).toEqual([
      [0, -1, 5, undefined],
      [1, 2, 3, 4],
      [0, -1, 5, undefined],
    ]);
  });

  it('floors an int, and reads an index counted from 1 as one counted from 0', () => {
    const { lua, recorder } = mount();
    lua.evaluate('test.ints(2.7, 3.9) test.ints()');
    expect(recorder.calls).toEqual([
      [2, 2],
      [0, 0],
    ]);
  });

  it('takes truth the way Lua does: only nil and false are false', () => {
    const { lua, recorder } = mount();
    lua.evaluate('test.truth(0, "") test.truth(false, false) test.truth()');
    expect(recorder.calls).toEqual([
      [true, true],
      [false, false],
      [true, undefined],
    ]);
  });

  it('reads a number as a string, and anything but a table as an empty one', () => {
    const { lua, recorder } = mount();
    lua.evaluate('test.text(12, { a = 1 }) test.text(nil, 3)');
    expect(recorder.calls).toEqual([
      ['12', { a: 1 }],
      ['', {}],
    ]);
  });

  it('tells an argument left out from one passed as nil', () => {
    const { lua, recorder } = mount();
    lua.evaluate('test.presence() test.presence(nil) test.presence(3)');
    expect(recorder.calls).toEqual([['left out'], ['given undefined'], ['given 3']]);
  });

  it('hands the rest of the arguments over as one list, nils kept', () => {
    const { lua, recorder } = mount();
    lua.evaluate('test.varargs("a", 1, nil, "b") test.varargs("a")');
    expect(recorder.calls).toEqual([
      ['a', [1, undefined, 'b']],
      ['a', []],
    ]);
  });

  it('calls back into Lua, and refuses what is not a function with a Lua error', () => {
    const { lua, recorder } = mount();
    lua.evaluate('test.callback(function() return 7 end)');
    expect(recorder.calls).toEqual([[[7]]]);
    expect(() => lua.evaluate('test.callback(3)')).toThrow(
      "bad argument #1 to 'test.callback' (function expected, got number)",
    );
  });

  it('returns several values from an array, and sets a value member as it is', () => {
    const { lua } = mount();
    expect(lua.evaluate('local a, b = test.pair() return a, b, test.answer')).toEqual([1, 2, 42]);
  });
});

describe('luaFn', () => {
  it('names only a method that takes every argument the spec reads, as it reads them', () => {
    const wrong = defineLuaNamespace<Recorder>('wrong', {
      extra: luaFn(
        { summary: '', params: [given, param.number('extra')], returns: null },
        // @ts-expect-error -- `presence` takes no second argument
        'presence',
      ),
      mistyped: luaFn(
        { summary: '', params: [param.number('key')], returns: null },
        // @ts-expect-error -- `presence` takes a string
        'presence',
      ),
      field: luaFn(
        { summary: '', params: [], returns: null },
        // @ts-expect-error -- `calls` is not a method
        'calls',
      ),
    });
    expect(Object.keys(wrong.members)).toHaveLength(3);
  });
});

describe('LUA_API', () => {
  const entry = (name: string): LuaApiEntry | undefined =>
    LUA_API.find((each) => `${each.ns}.${each.name}` === name);

  it('writes the optional arguments of a signature in brackets, after the required ones', () => {
    expect(entry('gfx.draw_sprite')?.signature).toBe(
      'gfx.draw_sprite(n, x, y[, w, h, flip_h, flip_v, scale, transparent])',
    );
    expect(entry('sound.set_volume')?.signature).toBe('sound.set_volume([master, music, sfx])');
    expect(entry('gfx.set_color')?.signature).toBe('gfx.set_color(index, hex | r[, g, b])');
    expect(entry('sys.log')?.signature).toBe('sys.log(...)');
    expect(entry('net.state')?.signature).toBe('net.state');
  });

  it('carries each parameter with its type and what a left-out one reads as', () => {
    expect(entry('map.draw')?.params.at(-1)).toEqual({
      name: 'm',
      type: 'number',
      optional: true,
      default: '1',
    });
    expect(entry('gfx.blank')?.params).toEqual([
      { name: 'on', type: 'boolean', optional: true, default: 'true' },
    ]);
  });
});
