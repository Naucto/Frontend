import { InputState } from '../input/InputState';
import type { NetHostOptions, NetUi } from '../net/NetUi';
import type { SessionTransport } from '../net/SessionTransport';
import { SharedTableSession } from '../net/SharedTableSession';
import { LuaEnvironment } from '../vm/LuaEnvironment';
import type { ApiContext } from './ApiContext';
import { NetAPI } from './NetAPI';
import type { GameData, GfxBackend, SysPort } from './ports';

const hostTransport = (): SessionTransport => ({
  role: 'host',
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
  netUi: ui,
  gfx: stub as GfxBackend,
  data: stub as GameData,
  sys: stub as SysPort,
  input: new InputState(),
  log: () => undefined,
  print: () => undefined,
});

function setup(): { lua: LuaEnvironment; session: SharedTableSession } {
  const lua = new LuaEnvironment();
  const session = new SharedTableSession(hostTransport());
  const ui: NetUi = {
    host: (_options, onReady) => {
      onReady(session);
    },
    join: (onReady) => {
      onReady(null);
    },
    leave: () => undefined,
  };

  new NetAPI(makeContext(lua, ui));

  return { lua, session };
}

describe('NetAPI net.state', () => {
  it('errors when no session is active', () => {
    const lua = new LuaEnvironment();
    const ui: NetUi = { host: () => undefined, join: () => undefined, leave: () => undefined };
    new NetAPI(makeContext(lua, ui));

    expect(() => lua.evaluate('return net.state.score')).toThrow(/no active session/);
  });

  it('exposes the local user id via net.id', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    expect(lua.evaluate('return net.id()')[0]).toBe(1);
  });

  it('reads and writes scalars after net.host', () => {
    const { lua, session } = setup();

    lua.evaluate('net.host()');
    lua.evaluate('net.state.score = 10');

    expect(session.getValue('score')).toBe(10);
    expect(lua.evaluate('return net.state.score')[0]).toBe(10);
  });

  it('flattens nested table assignment', () => {
    const { lua, session } = setup();
    lua.evaluate('net.host()');

    lua.evaluate('net.state.players = { alice = { x = 1, y = 2 } }');

    expect(session.getValue('players.alice.x')).toBe(1);
    expect(session.getValue('players.alice.y')).toBe(2);
    expect(lua.evaluate('return net.state.players.alice.x')[0]).toBe(1);
  });

  it('deletes a key when assigned nil', () => {
    const { lua, session } = setup();
    lua.evaluate('net.host()');
    lua.evaluate('net.state.score = 5');

    lua.evaluate('net.state.score = nil');

    expect(session.getValue('score')).toBeUndefined();
  });

  it('delivers change events to a Lua net.on listener', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    lua.evaluate("net.on('score', function(_path, value) _G.seen = value end)");
    lua.evaluate('net.state.score = 42');

    expect(lua.evaluate('return _G.seen')[0]).toBe(42);
  });

  it('rejects storing a function in net.state', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    expect(() => lua.evaluate('net.state.cb = function() end')).toThrow(/cannot store a function/);
  });

  it('runs a net.state lock critical section and reports lock state', () => {
    const { lua, session } = setup();
    lua.evaluate('net.host()');

    lua.evaluate(`
      net.state.gate = net.lock()
      _G.before = net.state.gate.is_locked()
      net.state.gate.acquire(function(release)
        _G.during = net.state.gate.is_locked()
        net.state.score = (net.state.score or 0) + 1
        release()
      end)
      _G.after = net.state.gate.is_locked()
    `);

    expect(session.getValue('score')).toBe(1);
    expect(session.objectKindAt('gate')).toBe('lock');
    expect(lua.evaluate('return _G.before')[0]).toBe(false);
    expect(lua.evaluate('return _G.during')[0]).toBe(true);
    expect(lua.evaluate('return _G.after')[0]).toBe(false);
  });

  it('exposes queue length and peek from net.state', () => {
    const { lua, session } = setup();
    lua.evaluate('net.host()');

    lua.evaluate(`
      net.state.events = net.queue()
      net.state.events.push("a")
      net.state.events.push("b")
      _G.len = net.state.events.length()
      _G.head = net.state.events.peek()
    `);

    expect(lua.evaluate('return _G.len')[0]).toBe(2);
    expect(lua.evaluate('return _G.head')[0]).toBe('a');
    expect(session.queueLength('events')).toBe(2);
  });

  it('passes the game-supplied max_players to the host UI', () => {
    const lua = new LuaEnvironment();
    let captured: NetHostOptions | undefined;
    const ui: NetUi = {
      host: (options, onReady) => {
        captured = options;
        onReady(null);
      },
      join: (onReady) => {
        onReady(null);
      },
      leave: () => undefined,
    };
    new NetAPI(makeContext(lua, ui));

    lua.evaluate("net.host({ max_players = 6, title = 'Arena' })");

    expect(captured).toEqual({ maxPlayers: 6, title: 'Arena' });
  });

  it('pushes and pops FIFO through a net.state queue', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    lua.evaluate(`
      net.state.events = net.queue()
      net.state.events.push(7)
      net.state.events.push(8)
      net.state.events.pop(function(value) _G.first = value end)
      net.state.events.pop(function(value) _G.second = value end)
    `);

    expect(lua.evaluate('return _G.first')[0]).toBe(7);
    expect(lua.evaluate('return _G.second')[0]).toBe(8);
  });

  it('blocks net.join while already hosting', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    expect(() => lua.evaluate('net.join()')).toThrow(/already in a session/);
  });

  it('ignores repeated net.host/net.join while a dialog is still open', () => {
    // A dialog that never resolves keeps the request pending, mimicking a key
    // held across frames. Repeat calls must be no-ops, not throw (which would
    // halt the game loop).
    const lua = new LuaEnvironment();
    let hostCalls = 0;
    let joinCalls = 0;
    const ui: NetUi = {
      host: () => {
        hostCalls++;
      },
      join: () => {
        joinCalls++;
      },
      leave: () => undefined,
    };
    new NetAPI(makeContext(lua, ui));

    expect(() => {
      lua.evaluate('net.host()');
      lua.evaluate('net.host()');
      lua.evaluate('net.join()');
    }).not.toThrow();
    expect(hostCalls).toBe(1);
    expect(joinCalls).toBe(0);
  });

  it('blocks net.host after joining as a client', () => {
    const lua = new LuaEnvironment();
    const session = new SharedTableSession(hostTransport());
    const ui: NetUi = {
      host: (_options, onReady) => {
        onReady(session);
      },
      join: (onReady) => {
        onReady(session);
      },
      leave: () => undefined,
    };
    new NetAPI(makeContext(lua, ui));

    lua.evaluate('net.join()');

    expect(() => lua.evaluate('net.host()')).toThrow(/already in a session/);
  });

  it('allows hosting again after net.leave', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');
    lua.evaluate('net.leave()');

    expect(() => lua.evaluate('net.host()')).not.toThrow();
  });
});

describe('NetAPI net.state objects', () => {
  it('keeps a net.state object usable across separate evaluations', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    // A bare net.queue() handle would be local; round-tripping through net.state
    // and being re-fetched each call proves the object lives in the shared table.
    lua.evaluate('net.state.q = net.queue()');
    lua.evaluate('net.state.q.push(42)');
    lua.evaluate('net.state.q.pop(function(v) _G.got = v end)');

    expect(lua.evaluate('return _G.got')[0]).toBe(42);
  });

  it('reads an empty queue back as a non-nil object', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    lua.evaluate('net.state.respawns = net.queue()');

    expect(lua.evaluate('return net.state.respawns ~= nil')[0]).toBe(true);
    expect(lua.evaluate('return net.state.respawns.length()')[0]).toBe(0);
  });

  it('declares a lock nested inside an assigned table', () => {
    const { lua, session } = setup();
    lua.evaluate('net.host()');

    lua.evaluate(`
      net.state.coins = { { x = 1, y = 2, taken = false, lock = net.lock() } }
      net.state.coins[1].lock.acquire(function(release)
        _G.locked = net.state.coins[1].lock.is_locked()
        release()
      end)
    `);

    expect(session.getValue('coins.1.x')).toBe(1);
    expect(session.objectKindAt('coins.1.lock')).toBe('lock');
    expect(lua.evaluate('return _G.locked')[0]).toBe(true);
    expect(lua.evaluate('return net.state.coins[1].x')[0]).toBe(1);
  });

  it('lists a nested object in pairs but hides its reserved backing', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    lua.evaluate(`
      net.state.coins = { { x = 1, lock = net.lock() } }
      local keys = {}
      for k in pairs(net.state.coins[1]) do keys[k] = true end
      _G.has_x = keys["x"] == true
      _G.has_lock = keys["lock"] == true
      _G.child_reserved = keys["__netobj__"] == true

      local top = {}
      for k in pairs(net.state) do top[k] = true end
      _G.top_reserved = top["__netobj__"] == true
    `);

    expect(lua.evaluate('return _G.has_x')[0]).toBe(true);
    expect(lua.evaluate('return _G.has_lock')[0]).toBe(true);
    expect(lua.evaluate('return _G.child_reserved')[0]).toBe(false);
    expect(lua.evaluate('return _G.top_reserved')[0]).toBe(false);
  });

  it('keeps a branch alive when its only child is an object', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    lua.evaluate('net.state.box = { gate = net.lock() }');

    expect(lua.evaluate('return net.state.box ~= nil')[0]).toBe(true);
    expect(lua.evaluate('return net.state.box.gate.is_locked()')[0]).toBe(false);
  });

  it('counts an array of objects with the length operator', () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    lua.evaluate('net.state.locks = { net.lock(), net.lock(), net.lock() }');

    expect(lua.evaluate('return #net.state.locks')[0]).toBe(3);
  });

  it('replaces a scalar with an object and back', () => {
    const { lua, session } = setup();
    lua.evaluate('net.host()');

    lua.evaluate('net.state.gate = 5');
    expect(session.getValue('gate')).toBe(5);

    lua.evaluate('net.state.gate = net.lock()');
    expect(session.getValue('gate')).toBeUndefined();
    expect(session.objectKindAt('gate')).toBe('lock');
    expect(lua.evaluate('return net.state.gate.is_locked()')[0]).toBe(false);

    lua.evaluate('net.state.gate = 9');
    expect(session.objectKindAt('gate')).toBeUndefined();
    expect(session.getValue('gate')).toBe(9);
    expect(lua.evaluate('return net.state.gate')[0]).toBe(9);
  });

  it('clears an object when its slot is set to nil', () => {
    const { lua, session } = setup();
    lua.evaluate('net.host()');

    lua.evaluate(`
      net.state.respawns = net.queue()
      net.state.respawns.push(1)
    `);
    expect(session.objectKindAt('respawns')).toBe('queue');

    lua.evaluate('net.state.respawns = nil');

    expect(session.objectKindAt('respawns')).toBeUndefined();
    expect(session.queueLength('respawns')).toBe(0);
    expect(lua.evaluate('return net.state.respawns == nil')[0]).toBe(true);
  });

  it("does not fire net.on for an object's internal churn", () => {
    const { lua } = setup();
    lua.evaluate('net.host()');

    lua.evaluate(`
      _G.hits = 0
      net.on("respawns.**", function() _G.hits = _G.hits + 1 end)
      net.state.respawns = net.queue()
      net.state.respawns.push(1)
      net.state.respawns.pop(function() end)
    `);

    expect(lua.evaluate('return _G.hits')[0]).toBe(0);
  });

  it('provides a local queue and lock without a session', () => {
    const lua = new LuaEnvironment();
    const ui: NetUi = { host: () => undefined, join: () => undefined, leave: () => undefined };
    new NetAPI(makeContext(lua, ui));

    lua.evaluate(`
      local q = net.queue()
      q.push(1)
      q.push(2)
      q.pop(function(v) _G.first = v end)
      _G.len = q.length()

      local m = net.lock()
      m.acquire(function(release)
        _G.held = m.is_locked()
        release()
      end)
      _G.released = m.is_locked()
    `);

    expect(lua.evaluate('return _G.first')[0]).toBe(1);
    expect(lua.evaluate('return _G.len')[0]).toBe(1);
    expect(lua.evaluate('return _G.held')[0]).toBe(true);
    expect(lua.evaluate('return _G.released')[0]).toBe(false);
  });
});
