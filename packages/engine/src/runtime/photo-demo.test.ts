import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from '../game/Game';
import { RecordingBackend } from '../gfx/RecordingBackend';
import { STEP_MS } from '../loop/GameLoop';
import { Engine } from './Engine';

const driver = { request: () => 0, cancel: () => undefined, now: () => 0 };
const DEMO = fileURLToPath(new URL('../../../../e2e/docs/lua/gfx-photo.lua', import.meta.url));

/**
 * The generated demo is the one Lua file in the repository nobody proofreads, and the one that
 * asks the most of a frame: 57 600 `gfx.pixel` calls under the instruction budget, then a palette
 * per band from `_scanline`.
 */
describe('gfx-photo demo', () => {
  it('draws the picture on the first frame only and sets a palette per band from _scanline', () => {
    const source = readFileSync(DEMO, 'utf8');
    const palettes = source
      .split('\n')
      .filter((l) => l.startsWith('  { "#'))
      .map((l) => [...l.matchAll(/"(#[0-9a-f]{6})"/g)].map((m) => m[1]));
    expect(palettes).toHaveLength(15);

    const game = new Game(new Y.Doc());
    game.seedDefaults();
    const main = game.files[0];
    main?.text.delete(0, main.text.length);
    main?.text.insert(0, source);
    const gfx = new RecordingBackend();
    const engine = new Engine({ game, gfx, driver });
    expect(engine.load()).toBeNull();
    engine.run();
    expect(engine.tick(STEP_MS)).toBe(true);
    expect(gfx.ops('pixel')).toHaveLength(320 * 180);
    const lines = gfx.ops('setLinePalette');
    expect(lines.find((c) => c.args[0] === 0)?.args[1]).toEqual(palettes[0]);
    expect(lines.find((c) => c.args[0] === 12)?.args[1]).toEqual(palettes[1]);
    expect(lines.find((c) => c.args[0] === 179)?.args[1]).toEqual(palettes[14]);

    expect(engine.tick(STEP_MS * 3)).toBe(true);
    expect(engine.error).toBeNull();
    expect(gfx.ops('pixel')).toHaveLength(320 * 180);
    engine.destroy();
  });
});
