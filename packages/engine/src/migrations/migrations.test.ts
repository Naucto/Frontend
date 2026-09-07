import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { PICO8_PALETTE } from '../game/defaults';
import { Game } from '../game/Game';
import { LEGACY_KEYS } from '../game/keys';
import { migrateGame, needsMigration } from './index';
import type { MigrationReport } from './types';
import { computeCodeSplices } from './v0_to_v1/code';

const LEGACY_CODE = `local player = { x = 1, sprites = { top_left = 1 } }
function _update()
  if key_pressed("ArrowLeft") then player.x = player.x - 1 end
end
function _draw()
  clear(0)
  sprite(player.sprites.top_left, player.x, 10, 1, 1)
  line(7, 0, 0, 10, 10)
  rect(8, 1, 2, 3, 4)
  map(0, 0)
  if mget(1, 2) == 3 and fget(3, 1) then play_music(0) end
end
`;

function v0Doc(): Y.Doc {
  const doc = new Y.Doc();
  doc.getText(LEGACY_KEYS.code).insert(0, LEGACY_CODE);
  doc.getMap<number>(LEGACY_KEYS.sprites).set('8,0', 10);
  doc.getMap<number>(LEGACY_KEYS.flags).set('1', 3);
  doc.getMap<number>(LEGACY_KEYS.tiles).set('2,1', 1);
  const music = {
    bpm: 240,
    length: 32,
    numberOfOctaves: 2,
    notes: [
      [JSON.stringify({ note: 'C4', duration: 1, instrument: 'piano' })],
      [],
      [null, JSON.stringify({ note: 'E4', duration: 2, instrument: 'guitar' })],
    ],
  };
  doc.getArray<string>(LEGACY_KEYS.musics).push([JSON.stringify(music)]);
  return doc;
}

describe('migrateGame v0 → v1', () => {
  it('detects v0 content', () => {
    expect(needsMigration(v0Doc())).toBe(true);
    expect(needsMigration(new Y.Doc())).toBe(false);
  });

  it('moves data, keeps the PICO-8 palette and rewrites code', () => {
    const doc = v0Doc();
    const report = migrateGame(doc);
    expect(report.applied).toBe(true);
    const game = new Game(doc);
    expect(game.schemaVersion).toBe(1);
    expect(game.palette).toEqual([...PICO8_PALETTE]);
    expect(game.getPixel(8, 0)).toBe(10);
    expect(game.getFlag(1)).toBe(3);
    expect(game.getTile(2, 1)).toBe(1);
    expect(game.files).toHaveLength(1);
    const code = game.files[0]?.text.toString() ?? '';
    expect(code).toContain('input.key_pressed("ArrowLeft")');
    expect(code).toContain('gfx.clear(0)');
    expect(code).toContain('gfx.draw_sprite(player.sprites.top_left, player.x, 10, 1, 1)');
    expect(code).toContain('gfx.line(0, 0, 10, 10, 7)');
    expect(code).toContain('gfx.rect(1, 2, 3, 4, 8)');
    expect(code).toContain('map.draw(0, 0)');
    expect(code).toContain('map.get(1, 2) == 3 and map.flag(3, 1)');
    expect(code).toContain('sound.play_music(0)');
    expect(code).toContain('sprites = { top_left = 1 }');
    // legacy keys are emptied and the migration is idempotent
    expect(doc.getText(LEGACY_KEYS.code).length).toBe(0);
    expect(migrateGame(doc).applied).toBe(false);
  });

  it('converts music best-effort', () => {
    const doc = v0Doc();
    migrateGame(doc);
    const game = new Game(doc);
    const patterns = game.getPatterns();
    expect(patterns.size).toBe(1);
    const p = [...patterns.values()][0];
    expect(p?.bpm).toBe(60);
    expect(p?.notes.map((n) => [n.step, n.pitch, n.instrument])).toEqual([
      [0, 60, 'piano'],
      [2, 64, 'guitar'],
    ]);
    expect([...game.getInstruments().keys()].sort()).toEqual(['guitar', 'piano']);
    expect(game.getSongs().get('0')?.sequence).toEqual([p?.id]);
  });

  it('leaves user-redefined globals and multi-value tails alone', () => {
    const report: MigrationReport = { from: 0, to: 1, applied: false, counts: {}, warnings: [] };
    const src = 'function sprite(a) end\nsprite(1)\nline(unpack(t))\nlocal x = clear';
    const splices = computeCodeSplices(src, report) ?? [];
    expect(splices.map((s) => s.text)).toEqual(['gfx.clear']);
    expect(report.warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"sprite" is redefined'),
        expect.stringContaining('line(...)'),
      ]),
    );
  });

  it('falls back to token rewriting on syntax errors', () => {
    const doc = new Y.Doc();
    doc.getText(LEGACY_KEYS.code).insert(0, 'clear(0\nsprite(1, 2, 3)');
    migrateGame(doc);
    const code = new Game(doc).files[0]?.text.toString();
    expect(code).toContain('gfx.clear(0');
    expect(code).toContain('gfx.draw_sprite(1, 2, 3)');
  });
});
