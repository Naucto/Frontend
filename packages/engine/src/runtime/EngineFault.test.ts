import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../game/EditableGame';
import { RecordingBackend } from '../gfx/RecordingBackend';
import { Engine } from './Engine';
import { type EngineFault, isHostBug } from './EngineFault';

const driver = { request: () => 0, cancel: () => undefined };

class BrokenClear extends RecordingBackend {
  override clear(): void {
    throw new TypeError("Cannot read properties of undefined (reading 'x')");
  }
}

function gameWith(source: string): EditableGame {
  const game = new EditableGame(new Y.Doc());
  game.seedDefaults();
  const main = game.files[0];
  main?.text.delete(0, main.text.length);
  main?.text.insert(0, source);
  return game;
}

describe('engine faults', () => {
  it('tells a bug of the host from a refusal it throws on purpose', () => {
    expect(isHostBug(new TypeError('x'))).toBe(true);
    expect(isHostBug(new ReferenceError('x'))).toBe(true);
    expect(isHostBug(new RangeError('Invalid array length'))).toBe(true);
    expect(isHostBug(new RangeError('Maximum call stack size exceeded'))).toBe(false);
    expect(isHostBug(new Error('bad argument #1'))).toBe(false);
  });

  it('reports a JS bug escaping a host call, and still halts the game on it', () => {
    const engine = new Engine({
      game: gameWith('function _init() gfx.clear(0) end'),
      gfx: new BrokenClear(),
      driver,
    });
    const faults: EngineFault[] = [];
    engine.onFault((fault) => {
      faults.push(fault);
    });

    const failure = engine.load();

    expect(failure?.phase).toBe('init');
    expect(engine.currentState).toBe('halted');
    expect(faults).toEqual([expect.objectContaining({ kind: 'internal', name: 'TypeError' })]);
    engine.destroy();
  });

  it('never reports the game’s own error', () => {
    const engine = new Engine({
      game: gameWith('function _init() error("deliberate") end'),
      gfx: new RecordingBackend(),
      driver,
    });
    const faults: EngineFault[] = [];
    engine.onFault((fault) => {
      faults.push(fault);
    });

    expect(engine.load()?.message).toContain('deliberate');
    expect(faults).toEqual([]);
    engine.destroy();
  });
});
