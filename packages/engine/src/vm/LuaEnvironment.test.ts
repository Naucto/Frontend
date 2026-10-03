import { describe, expect, it } from 'vitest';

import { LuaEnvironment } from './LuaEnvironment';

describe('the VM against the host it runs on', () => {
  it('leaves a game no os that reaches the host, and keeps the os that only reads the clock', () => {
    const lua = new LuaEnvironment();

    const [execute, getenv, remove, rename, tmpname, exit, clock] = lua.evaluate(
      'return os.execute, os.getenv, os.remove, os.rename, os.tmpname, os.exit, type(os.time)',
    );

    expect([execute, getenv, remove, rename, tmpname, exit]).toEqual(
      Array.from({ length: 6 }, () => undefined),
    );
    expect(clock).toBe('function');
  });

  it('leaves a game no loader that fetches code from outside the VM', () => {
    const lua = new LuaEnvironment();

    const [loadlib, searchers, getregistry, preload] = lua.evaluate(
      'return package.loadlib, #package.searchers, debug.getregistry, type(package.preload)',
    );

    expect([loadlib, searchers, getregistry, preload]).toEqual([undefined, 1, undefined, 'table']);
  });
});
