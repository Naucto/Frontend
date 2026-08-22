import { LUA_PROXY, LuaEnvironment, LuaProxy } from "./LuaEnvironment";

const makeProxy = (store: Map<string, unknown>, prefix: string): LuaProxy => {
  const pathOf = (key: string | number): string => (prefix ? `${prefix}.${key}` : String(key));

  const isContainer = (path: string): boolean => {
    for (const key of store.keys()) {
      if (key.startsWith(path + "."))
        return true;
    }

    return false;
  };

  const childKeys = (): string[] => {
    const pre = prefix ? prefix + "." : "";
    const children = new Set<string>();

    for (const key of store.keys()) {
      if (prefix && !key.startsWith(pre))
        continue;

      const rest = key.slice(pre.length);
      const dot = rest.indexOf(".");
      children.add(dot === -1 ? rest : rest.slice(0, dot));
    }

    return [...children];
  };

  return {
    [LUA_PROXY]: true,
    index(key: string | number): unknown {
      const path = pathOf(key);

      if (store.has(path))
        return store.get(path);

      if (isContainer(path))
        return makeProxy(store, path);

      return undefined;
    },
    newindex(key: string | number, value: unknown): void {
      store.set(pathOf(key), value);
    },
    keys(): string[] {
      return childKeys();
    },
    len(): number {
      let n = 0;
      while (store.has(pathOf(n + 1)))
        n++;

      return n;
    },
  };
};

describe("setMetatable", () => {
  it("routes __index through the metatable and propagates its return", () => {
    const lua = new LuaEnvironment();
    let receivedKey: unknown;

    lua.pushObject({});
    lua.setMetatable({
      index(key: string | number): unknown {
        receivedKey = key;
        return 42;
      },
    });
    lua.setGlobal("t");

    const [value] = lua.evaluate("return t.foo");

    expect(receivedKey).toBe("foo");
    expect(value).toBe(42);
  });

  it("routes __newindex through the metatable", () => {
    const lua = new LuaEnvironment();
    const args: unknown[] = [];

    lua.pushObject({});
    lua.setMetatable({
      newindex(key: string | number, value: unknown): void {
        args.push(key, value);
      },
    });
    lua.setGlobal("t");

    lua.evaluate("t.bar = 7");

    expect(args).toEqual(["bar", 7]);
  });
});

describe("LuaProxy bridge", () => {
  it("resolves nested proxied tables through __index", () => {
    const lua = new LuaEnvironment();
    const store = new Map<string, unknown>([
      ["players.alice.x", 5],
      ["players.alice.y", 9],
      ["score", 100],
    ]);
    lua.setGlobalWith("state", makeProxy(store, ""));

    expect(lua.evaluate("return state.score")[0]).toBe(100);
    expect(lua.evaluate("return state.players.alice.x")[0]).toBe(5);
    expect(lua.evaluate("return state.players.alice.missing")[0]).toBeUndefined();
  });

  it("writes through nested __newindex", () => {
    const lua = new LuaEnvironment();
    const store = new Map<string, unknown>([["players.alice.x", 5]]);
    lua.setGlobalWith("state", makeProxy(store, ""));

    lua.evaluate("state.players.alice.x = 7");

    expect(store.get("players.alice.x")).toBe(7);
  });

  it("iterates immediate children via __pairs", () => {
    const lua = new LuaEnvironment();
    const store = new Map<string, unknown>([
      ["players.alice.x", 1],
      ["players.bob.x", 2],
    ]);
    lua.setGlobalWith("state", makeProxy(store, ""));

    const joined = lua.evaluate(`
      local names = {}
      for k in pairs(state.players) do names[#names + 1] = k end
      table.sort(names)
      return table.concat(names, ",")
    `)[0];

    expect(joined).toBe("alice,bob");
  });

  it("reports array length via __len", () => {
    const lua = new LuaEnvironment();
    const store = new Map<string, unknown>([
      ["1", "a"],
      ["2", "b"],
      ["3", "c"],
    ]);
    lua.setGlobalWith("arr", makeProxy(store, ""));

    expect(lua.evaluate("return #arr")[0]).toBe(3);
  });
});
