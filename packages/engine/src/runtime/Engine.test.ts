import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from '../game/Game';
import { RecordingBackend } from '../gfx/RecordingBackend';
import type { InputSource } from '../input/InputSource';
import type { InputState } from '../input/InputState';
import { STEP_MS } from '../loop/GameLoop';
import { Engine } from './Engine';

const driver = { request: () => 0, cancel: () => undefined, now: () => 0 };

describe('Engine', () => {
  it('runs the starter game headlessly and moves the moon with btn("right")', () => {
    const doc = new Y.Doc();
    const game = new Game(doc);
    game.seedDefaults();
    const gfx = new RecordingBackend();
    let held = false;
    const source: InputSource = {
      attach: () => undefined,
      detach: () => undefined,
      poll: (s: InputState) => {
        s.setAction(0, 'right', held);
      },
    };
    const engine = new Engine({ game, gfx, inputs: [source], driver });
    expect(engine.load()).toBeNull();
    expect(engine.console.lines.map((l) => l.text)).toEqual(['Welcome to Naucto!']);
    engine.run();
    engine.tick(STEP_MS);
    const first = gfx.ops('drawSprite')[0]?.args[1];
    held = true;
    engine.tick(STEP_MS * 5);
    const last = gfx.ops('drawSprite').at(-4)?.args[1];
    expect(last).toBe((first as number) + 2 * 5);
    expect(engine.stats.frame).toBe(6);
    expect(gfx.frames).toBeGreaterThan(1);
    engine.destroy();
  });

  it('halts with a structured error', () => {
    const doc = new Y.Doc();
    const game = new Game(doc);
    game.seedDefaults();
    const f = game.files[0];
    f?.text.delete(0, f.text.length);
    f?.text.insert(0, 'function _update()\n  local t = nil\n  t.x = 1\nend');
    const engine = new Engine({ game, gfx: new RecordingBackend(), driver });
    const errors: string[] = [];
    engine.onError((e) => errors.push(`${e.phase}:${String(e.line)}`));
    engine.run();
    expect(engine.tick(STEP_MS)).toBe(false);
    expect(engine.currentState).toBe('halted');
    expect(errors).toEqual(['update:3']);
    expect(engine.error?.file).toBe('main.lua');
  });

  it('loads extra tabs as modules', () => {
    const doc = new Y.Doc();
    const game = new Game(doc);
    game.seedDefaults();
    game.addFile('util.lua', 'local M = {}\nfunction M.twice(x) return x * 2 end\nreturn M');
    const f = game.files.find((x) => x.name === 'main.lua');
    f?.text.delete(0, f.text.length);
    f?.text.insert(0, 'local util = require("util")\nfunction _init() print(util.twice(21)) end');
    const engine = new Engine({ game, gfx: new RecordingBackend(), driver });
    expect(engine.load()).toBeNull();
    expect(engine.console.lines[0]?.text).toBe('42');
  });
});
