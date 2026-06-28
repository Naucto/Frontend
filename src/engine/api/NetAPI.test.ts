import { LuaEnvironment } from "@engine/lua/LuaEnvironment";
import { NetUi } from "@engine/net/NetUi";
import { SessionTransport } from "@engine/net/SessionTransport";
import { SharedTableSession } from "@engine/net/SharedTableSession";
import { InputSource, MapSource, Renderer, SoundPlayer, SpriteSource } from "@engine/ports";

import { ApiContext } from "./ApiContext";
import { NetAPI } from "./NetAPI";

const hostTransport = (): SessionTransport => ({
  role: "host",
  selfUserId: 1,
  broadcastState: () => undefined,
  respondTo: () => undefined,
  sendRequest: () => undefined,
  on: () => undefined,
  off: () => undefined,
  destroy: () => undefined,
});

const stub = {} as unknown;

const makeContext = (lua: LuaEnvironment, ui: NetUi): ApiContext => ({
  lua,
  ui,
  renderer: stub as Renderer,
  sprites: stub as SpriteSource,
  maps: stub as MapSource,
  input: stub as InputSource,
  sounds: stub as SoundPlayer,
  print: () => undefined,
});

function setup(): { lua: LuaEnvironment; session: SharedTableSession } {
  const lua = new LuaEnvironment();
  const session = new SharedTableSession(hostTransport());
  const ui: NetUi = {
    host: onReady => onReady(session),
    join: onReady => onReady(null),
    leave: () => undefined,
  };

  new NetAPI(makeContext(lua, ui));

  return { lua, session };
}

describe("NetAPI net.state", () => {
  it("errors when no session is active", () => {
    const lua = new LuaEnvironment();
    const ui: NetUi = { host: () => undefined, join: () => undefined, leave: () => undefined };
    new NetAPI(makeContext(lua, ui));

    expect(() => lua.evaluate("return net.state.score")).toThrow(/no active session/);
  });

  it("reads and writes scalars after net.host", () => {
    const { lua, session } = setup();

    lua.evaluate("net.host()");
    lua.evaluate("net.state.score = 10");

    expect(session.getValue("score")).toBe(10);
    expect(lua.evaluate("return net.state.score")[0]).toBe(10);
  });

  it("flattens nested table assignment", () => {
    const { lua, session } = setup();
    lua.evaluate("net.host()");

    lua.evaluate("net.state.players = { alice = { x = 1, y = 2 } }");

    expect(session.getValue("players.alice.x")).toBe(1);
    expect(session.getValue("players.alice.y")).toBe(2);
    expect(lua.evaluate("return net.state.players.alice.x")[0]).toBe(1);
  });

  it("deletes a key when assigned nil", () => {
    const { lua, session } = setup();
    lua.evaluate("net.host()");
    lua.evaluate("net.state.score = 5");

    lua.evaluate("net.state.score = nil");

    expect(session.getValue("score")).toBeUndefined();
  });

  it("delivers change events to a Lua net.on listener", () => {
    const { lua } = setup();
    lua.evaluate("net.host()");

    lua.evaluate("net.on('score', function(_path, value) _G.seen = value end)");
    lua.evaluate("net.state.score = 42");

    expect(lua.evaluate("return _G.seen")[0]).toBe(42);
  });

  it("rejects storing a function in net.state", () => {
    const { lua } = setup();
    lua.evaluate("net.host()");

    expect(() => lua.evaluate("net.state.cb = function() end")).toThrow(/cannot store a function/);
  });
});
