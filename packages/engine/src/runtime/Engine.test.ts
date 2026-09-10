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
    expect(engine.error?.file).toBe('main');
  });

  it('runs the tabs in the order they are in, and follows when they are reordered', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    const main = game.files[0];
    main?.text.delete(0, main.text.length);
    main?.text.insert(0, 'print("main")');
    const a = game.addFile('a.lua', 'print("a")');
    const b = game.addFile('b.lua', 'print("b")');

    const first = new Engine({ game, gfx: new RecordingBackend(), driver });
    expect(first.load()).toBeNull();
    expect(first.console.lines.map((l) => l.text)).toEqual(['main', 'a', 'b']);

    game.reorderFiles([b.id, a.id, main?.id ?? '']);
    const second = new Engine({ game, gfx: new RecordingBackend(), driver });
    expect(second.load()).toBeNull();
    expect(second.console.lines.map((l) => l.text)).toEqual(['b', 'a', 'main']);
  });

  it('blames the tab an error is written in, at the line it is written on', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    const main = game.files[0];
    main?.text.delete(0, main.text.length);
    main?.text.insert(0, '-- nothing wrong here');
    game.addFile('broken.lua', '\n\nerror("deliberate")');

    const engine = new Engine({ game, gfx: new RecordingBackend(), driver });
    const failure = engine.load();
    expect(failure?.file).toBe('broken.lua');
    expect(failure?.line).toBe(3);
  });

  it('runs every tab in the order of the strip, so a later one sees what an earlier one wrote', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    game.addFile('util', 'function twice(x) return x * 2 end');
    const util = game.files.find((x) => x.name === 'util');
    if (util) game.reorderFiles([util.id]);
    const main = game.files.find((x) => x.name === 'main');
    main?.text.delete(0, main.text.length);
    main?.text.insert(0, 'function _init() print(twice(21)) end');

    const engine = new Engine({ game, gfx: new RecordingBackend(), driver });
    expect(engine.load()).toBeNull();
    expect(engine.console.lines[0]?.text).toBe('42');
  });

  it('refuses require, and says why rather than blaming a nil', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    game.addFile('util', 'return {}');
    const main = game.files.find((x) => x.name === 'main');
    main?.text.delete(0, main.text.length);
    main?.text.insert(0, 'local util = require("util")');

    const engine = new Engine({ game, gfx: new RecordingBackend(), driver });
    const failure = engine.load();
    expect(failure?.file).toBe('main');
    expect(failure?.message).toContain('require is not available');
  });

  it('blames a tab whose name holds a space, which no shape of the name could tell apart', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    const main = game.files[0];
    main?.text.delete(0, main.text.length);
    main?.text.insert(0, '-- nothing wrong here');
    game.addFile('my helpers', '\n\nerror("deliberate")');

    const engine = new Engine({ game, gfx: new RecordingBackend(), driver });
    const failure = engine.load();
    expect(failure?.file).toBe('my helpers');
    expect(failure?.line).toBe(3);
  });
});
