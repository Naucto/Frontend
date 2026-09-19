import { describe, expect, it } from 'vitest';

import { InputState } from '../input/InputState';
import { LuaEnvironment } from '../vm/LuaEnvironment';
import type { ApiContext } from './ApiContext';
import type { GameData, GfxBackend, SysPort } from './ports';
import { SysAPI } from './SysAPI';

const stub = {} as unknown;

/** `print` and `sys.*` over a console that keeps what they wrote. */
const mount = (): { lua: LuaEnvironment; logs: string[] } => {
  const lua = new LuaEnvironment();
  const logs: string[] = [];
  const ctx: ApiContext = {
    lua,
    gfx: stub as GfxBackend,
    data: stub as GameData,
    sys: stub as SysPort,
    input: new InputState(),
    log: (level, text) => logs.push(`${level}:${text}`),
    print: () => undefined,
  };
  new SysAPI(ctx);
  return { lua, logs };
};

describe('SysAPI print', () => {
  it('spells nil as Lua does, not as JS does', () => {
    const { lua, logs } = mount();
    lua.evaluate('print(nil)');
    expect(logs).toEqual(['log:nil']);
  });

  it('spells booleans out', () => {
    const { lua, logs } = mount();
    lua.evaluate('print(true, false)');
    expect(logs).toEqual(['log:true\tfalse']);
  });

  it('names a function instead of showing the wrapper that carries it', () => {
    const { lua, logs } = mount();
    lua.evaluate('print(function() end)');
    expect(logs).toEqual(['log:function']);
  });

  it('shows a table as JSON', () => {
    const { lua, logs } = mount();
    lua.evaluate('print({a = 1})');
    expect(logs).toEqual(['log:{"a":1}']);
  });

  it('separates its arguments with a tab', () => {
    const { lua, logs } = mount();
    lua.evaluate('print("a", 1, nil, "b")');
    expect(logs).toEqual(['log:a\t1\tnil\tb']);
  });

  it('routes sys.log, sys.warn and sys.error by level', () => {
    const { lua, logs } = mount();
    lua.evaluate('sys.log("l") sys.warn("w", nil) sys.error("e")');
    expect(logs).toEqual(['log:l', 'warn:w\tnil', 'error:e']);
  });
});
