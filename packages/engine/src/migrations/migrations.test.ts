import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { PICO8_PALETTE } from '../game/defaults';
import { EditableGame } from '../game/EditableGame';
import { FIRST_SHEET_ID, GAME_SCHEMA_VERSION, KEYS, LEGACY_KEYS } from '../game/keys';
import { isFromFutureSchema, migrateGame, needsMigration, schemaVersionOf } from './index';
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
    const game = new EditableGame(doc);
    expect(game.schemaVersion).toBe(GAME_SCHEMA_VERSION);
    expect(game.palette).toEqual([...PICO8_PALETTE]);
    expect(game.sheets[0]?.getPixel(8, 0)).toBe(10);
    expect(game.flagOf(1)).toBe(3);
    expect(game.maps[0]?.getTile(2, 1)).toBe(1);
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
    const game = new EditableGame(doc);
    const patterns = game.getPatterns();
    expect(patterns.size).toBe(1);
    const pattern = [...patterns.values()][0];
    expect(pattern?.bpm).toBe(60);
    expect(pattern?.notes.map((note) => [note.step, note.pitch, note.instrument])).toEqual([
      [0, 60, 'piano'],
      [2, 64, 'guitar'],
    ]);
    expect([...game.getInstruments().keys()].sort()).toEqual(['guitar', 'piano']);
    expect(game.getSongs().get('0')?.sequence).toEqual([pattern?.id]);
  });

  it('skips a corrupt note and keeps the rest of its music in its slot', () => {
    const doc = v0Doc();
    const corrupt = {
      bpm: 240,
      length: 32,
      notes: [['{not json', JSON.stringify({ note: 'G4', duration: 1, instrument: 'piano' })]],
    };
    doc.getArray<string>(LEGACY_KEYS.musics).push([JSON.stringify(corrupt)]);

    const report = migrateGame(doc);

    const patterns = [...new EditableGame(doc).getPatterns().values()];
    expect(patterns).toHaveLength(2);
    expect(patterns.find((pattern) => pattern.slot === 1)?.notes.map((note) => note.pitch)).toEqual(
      [67],
    );
    expect(report.warnings.some((warning) => warning.step === 'sound')).toBe(true);
  });

  it('leaves user-redefined globals and multi-value tails alone', () => {
    const report: MigrationReport = { from: 0, to: 1, applied: false, counts: {}, warnings: [] };
    const src = 'function sprite(a) end\nsprite(1)\nline(unpack(t))\nlocal x = clear';
    const splices = computeCodeSplices(src, report) ?? [];
    expect(splices.map((splice) => splice.text)).toEqual(['gfx.clear']);
    expect(report.warnings.map((warning) => warning.message)).toEqual(
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
    const code = new EditableGame(doc).files[0]?.text.toString();
    expect(code).toContain('gfx.clear(0');
    expect(code).toContain('gfx.draw_sprite(1, 2, 3)');
  });

  it('warns on the line of each reordered call it cannot rewrite, rather than leaving it to run', () => {
    const doc = new Y.Doc();
    doc.getText(LEGACY_KEYS.code).insert(0, 'clear(0\nsprite(1, 2, 3)\nline(7, 0, 0, 1, 1)');

    const report = migrateGame(doc);

    const code = new EditableGame(doc).files[0]?.text.toString();
    expect(code).toContain('line(7, 0, 0, 1, 1)');
    expect(report.warnings).toEqual([
      expect.objectContaining({ step: 'code', file: 'main', line: 3 }),
    ]);
  });

  it('places the warning on a variable argument list on its line', () => {
    const report: MigrationReport = { from: 0, to: 1, applied: false, counts: {}, warnings: [] };
    computeCodeSplices('clear(0)\n\nline(unpack(t))', report);

    expect(report.warnings).toEqual([expect.objectContaining({ line: 3 })]);
  });

  it('renames a file too large to parse token by token', () => {
    const doc = new Y.Doc();
    const padding = `-- ${'x'.repeat(200_000)}\n`;
    doc.getText(LEGACY_KEYS.code).insert(0, `${padding}clear(0)\nrect(8, 1, 2, 3, 4)`);

    const report = migrateGame(doc);

    const code = new EditableGame(doc).files[0]?.text.toString() ?? '';
    expect(code.endsWith('gfx.clear(0)\nrect(8, 1, 2, 3, 4)')).toBe(true);
    expect(report.warnings).toEqual([expect.objectContaining({ line: 3 })]);
  });

  it('lands the sheet and the map on their collection entries', () => {
    const doc = v0Doc();
    migrateGame(doc);

    const entry = doc.getMap<Y.Map<unknown>>(KEYS.sheets).get(FIRST_SHEET_ID);
    expect((entry?.get('pixels') as Y.Map<number>).get('8,0')).toBe(10);
    expect(doc.getMap('gfx.sprites').size).toBe(0);
    expect(doc.getMap('map.tiles').size).toBe(0);
  });
});

/** The gate every schema step hangs off. */
describe('schemaVersionOf', () => {
  it('reads the marker a document carries', () => {
    const doc = new Y.Doc();
    doc.getMap(KEYS.meta).set('schemaVersion', 1);

    expect(schemaVersionOf(doc)).toBe(1);
    expect(needsMigration(doc)).toBe(GAME_SCHEMA_VERSION > 1);
  });

  it('calls an unmarked document with first-schema content the first schema', () => {
    const doc = v0Doc();

    expect(schemaVersionOf(doc)).toBe(0);
    expect(needsMigration(doc)).toBe(true);
  });

  /** Nobody has written it yet; it is about to be seeded at the current schema, not migrated. */
  it('calls an empty document current', () => {
    const doc = new Y.Doc();

    expect(schemaVersionOf(doc)).toBe(GAME_SCHEMA_VERSION);
    expect(needsMigration(doc)).toBe(false);
    expect(migrateGame(doc).applied).toBe(false);
  });

  it('leaves a document behind the current schema needing to be brought forward', () => {
    const doc = new Y.Doc();
    doc.getMap(KEYS.meta).set('schemaVersion', GAME_SCHEMA_VERSION - 1);

    expect(needsMigration(doc)).toBe(true);
  });
});

describe('a document from a newer build', () => {
  /** There is no migration backwards and the host saves on open, so a newer document is refused. */
  it('is refused rather than half-read', () => {
    const doc = new Y.Doc();
    doc.getMap(KEYS.meta).set('schemaVersion', GAME_SCHEMA_VERSION + 1);

    expect(isFromFutureSchema(doc)).toBe(true);
    expect(needsMigration(doc)).toBe(false);
    expect(migrateGame(doc).applied).toBe(false);
  });

  it('does not mistake the current schema for a newer one', () => {
    const doc = new Y.Doc();
    doc.getMap(KEYS.meta).set('schemaVersion', GAME_SCHEMA_VERSION);

    expect(isFromFutureSchema(doc)).toBe(false);
  });
});
