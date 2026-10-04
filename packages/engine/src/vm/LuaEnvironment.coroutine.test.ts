import { LUA_PROXY, LuaEnvironment } from './LuaEnvironment';

// A host function reads its arguments and pushes its results on the stack of the thread that called
// it. Called from a coroutine that is not the main thread, so marshalling against the main thread
// read a slot of the wrong stack ("Unsupported Lua type thread").
describe('host functions called from a coroutine', () => {
  it('receive their arguments and return their results', () => {
    const lua = new LuaEnvironment();
    lua.setGlobalWith('add', (a: unknown, b: unknown) => (a as number) + (b as number));
    lua.setGlobalWith('pair', (s: unknown) => [`${String(s)}!`, 7]);

    const [sum, text, n] = lua.evaluate(`
      local co = coroutine.create(function(x)
        local s = add(x, 2)
        local t, k = pair("hi")
        return s, t, k
      end)
      local ok, s, t, k = coroutine.resume(co, 40)
      assert(ok, s)
      return s, t, k
    `);

    expect([sum, text, n]).toEqual([42, 'hi!', 7]);
  });

  it('still work from the main thread afterwards, and across yields', () => {
    const lua = new LuaEnvironment();
    const seen: unknown[] = [];
    lua.setGlobalWith('log', (v: unknown) => {
      seen.push(v);
    });

    lua.evaluate(`
      local co = coroutine.wrap(function()
        log("a")
        coroutine.yield()
        log("b")
      end)
      co()
      log("main")
      co()
      log("end")
    `);

    expect(seen).toEqual(['a', 'main', 'b', 'end']);
  });

  it('turn a JS throw into a Lua error the coroutine can catch', () => {
    const lua = new LuaEnvironment();
    lua.setGlobalWith('boom', (v: unknown) => {
      throw new Error(`bad ${String(v)}`);
    });

    const [ok, message] = lua.evaluate(`
      local co = coroutine.wrap(function() return pcall(boom, 3) end)
      return co()
    `);

    expect(ok).toBe(false);
    expect(String(message)).toContain('bad 3');
  });

  it('reach proxied tables through their metamethods', () => {
    const lua = new LuaEnvironment();
    const store = new Map<string, unknown>([['score', 100]]);
    lua.setGlobalWith('state', {
      [LUA_PROXY]: true,
      index: (key: string | number) => store.get(String(key)),
      newindex: (key: string | number, value: unknown) => {
        store.set(String(key), value);
      },
    });

    const [score] = lua.evaluate(`
      local co = coroutine.wrap(function()
        state.score = state.score + 1
        return state.score
      end)
      return co()
    `);

    expect(score).toBe(101);
    expect(store.get('score')).toBe(101);
  });
});
