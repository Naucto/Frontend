import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../game/EditableGame';
import { luaSyntaxError, runHeadless } from './headless';

const gameOf = (source: string): EditableGame => {
  const game = new EditableGame(new Y.Doc());
  game.seedDefaults();
  game.setFileText(game.files[0]?.id ?? '', source);
  return game;
};

describe('a game run without a screen', () => {
  it('reports what it printed and what its last frame drew', () => {
    const run = runHeadless(
      gameOf(
        'function _init() print("hi") end\nlocal n = 0\nfunction _update() n = n + 1 end\nfunction _draw() gfx.clear(1) gfx.pixel(n, 2, 3) end',
      ),
      { frames: 5 },
    );
    expect(run.error).toBeNull();
    expect(run.frames).toBe(5);
    expect(run.console.map((line) => line.text)).toEqual(['hi']);
    expect(run.drawn.at(-1)).toEqual({ op: 'pixel', args: [5, 2, 3] });
    expect(run.counts).toEqual({ clear: 1, pixel: 1 });
  });

  it('holds an action over the frames asked for', () => {
    const run = runHeadless(
      gameOf('function _update() if input.held("right") then print(sys.frame()) end end'),
      { frames: 6, held: [{ action: 'right', from: 2, to: 4 }] },
    );
    expect(run.console.map((line) => line.text)).toEqual(['2', '3', '4']);
  });

  it('says where an error is and stops there', () => {
    const run = runHeadless(gameOf('function _update()\n  local t = nil\n  t.x = 1\nend'), {
      frames: 10,
    });
    expect(run.error).toMatchObject({ phase: 'update', file: 'main', line: 3, kind: 'runtime' });
    expect(run.frames).toBe(0);
  });

  it('stops a loop that never ends', () => {
    const run = runHeadless(gameOf('function _update() while true do end end'), { frames: 3 });
    expect(run.error?.kind).toBe('budget');
  });

  it('keeps a bounded list of draws', () => {
    const run = runHeadless(
      gameOf('function _draw() for i = 1, 1000 do gfx.pixel(1, 1, 1) end end'),
      { frames: 2 },
    );
    expect(run.drawn.length + run.omitted).toBe(1000);
    expect(run.counts.pixel).toBe(1000);
  });
});

describe('a piece of Lua', () => {
  it('is told where it does not parse, and is not run', () => {
    expect(luaSyntaxError('error("ran")', 'main')).toBeNull();
    expect(luaSyntaxError('local a = 1\nlocal = 2', 'main')?.line).toBe(2);
  });
});
