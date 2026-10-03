import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from '../../game/EditableGame';
import {
  FIRST_MAP_ID,
  FIRST_SHEET_ID,
  GAME_SCHEMA_VERSION,
  KEYS,
  MAP_HEIGHT,
  SHEET_HEIGHT,
} from '../../game/keys';
import { migrateGame, needsMigration } from '../index';

/**
 * A v2 document saved before the shape moved inside v2: the first sheet's and map's cells in the
 * roots, their size on the meta, and no collection entries.
 */
function v2WithRoots(): Y.Doc {
  const doc = new Y.Doc();
  const meta = doc.getMap(KEYS.meta);
  meta.set('schemaVersion', GAME_SCHEMA_VERSION);
  meta.set('sheetWidth', 64);
  meta.set('mapWidth', 40);
  doc.getMap<number>('gfx.sprites').set('3,4', 9);
  doc.getMap<number>('gfx.flags').set('7', 3);
  doc.getMap<number>('map.tiles').set('1,1', 7);

  return doc;
}

describe('a v2 document still holding the v1 shape', () => {
  it('is rewritten in place, without moving its schema', () => {
    const doc = v2WithRoots();
    expect(needsMigration(doc)).toBe(true);

    const report = migrateGame(doc);

    expect(report).toMatchObject({ from: GAME_SCHEMA_VERSION, to: GAME_SCHEMA_VERSION });
    expect(report.counts.reshaped).toBeGreaterThan(0);
    expect(doc.getMap(KEYS.meta).get('schemaVersion')).toBe(GAME_SCHEMA_VERSION);
    const game = new EditableGame(doc);
    expect(game.sheets.map((sheet) => sheet.id)).toEqual([FIRST_SHEET_ID]);
    expect(game.sheets[0]?.width).toBe(64);
    expect(game.sheets[0]?.height).toBe(SHEET_HEIGHT);
    expect(game.sheets[0]?.getPixel(3, 4)).toBe(9);
    expect(game.flagOf(7)).toBe(3);
    expect(game.maps.map((map) => map.id)).toEqual([FIRST_MAP_ID]);
    expect(game.maps[0]?.width).toBe(40);
    expect(game.maps[0]?.height).toBe(MAP_HEIGHT);
    expect(game.maps[0]?.getTile(1, 1)).toBe(7);
    expect(doc.getMap('gfx.sprites').size).toBe(0);
    expect(doc.getMap('map.tiles').size).toBe(0);
    expect(doc.getMap(KEYS.meta).has('sheetWidth')).toBe(false);
  });

  it('changes nothing the second time', () => {
    const doc = v2WithRoots();
    migrateGame(doc);

    expect(needsMigration(doc)).toBe(false);
    expect(migrateGame(doc).applied).toBe(false);
  });

  it('keeps the size its first entry states over the one the meta recorded', () => {
    const doc = v2WithRoots();
    doc.getMap<number>('gfx.sprites').set('200,4', 6);
    const entry = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>(KEYS.sheets).set(FIRST_SHEET_ID, entry);
    entry.set('order', 0);
    entry.set('w', 256);
    entry.set('h', 64);
    const second = new Y.Map<unknown>();
    doc.getMap<Y.Map<unknown>>(KEYS.sheets).set('b', second);
    second.set('order', 1);

    migrateGame(doc);

    const game = new EditableGame(doc);
    expect(game.sheets[0]?.width).toBe(256);
    expect(game.sheets[0]?.getPixel(200, 4)).toBe(6);
    // A second entry that stated no size took the meta's, as v1 read it.
    expect(game.sheets[1]?.width).toBe(64);
  });

  it('fills in what the synth reads of an instrument saved before it had it', () => {
    const doc = v2WithRoots();
    doc
      .getMap<string>(KEYS.instruments)
      .set('lead', JSON.stringify({ id: 'lead', arp: { steps: [] } }));

    migrateGame(doc);

    const instrument = new EditableGame(doc).getInstruments().get('lead');
    expect(instrument).toMatchObject({ detune: 0, glide: 0, arp: { rate: 0 } });
  });

  it('leaves an empty document to be seeded', () => {
    expect(needsMigration(new Y.Doc())).toBe(false);
  });
});

describe('a v1 document', () => {
  it('lands in the collection shape', () => {
    const doc = v2WithRoots();
    doc.getMap(KEYS.meta).set('schemaVersion', 1);

    const report = migrateGame(doc);

    expect(report.from).toBe(1);
    const game = new EditableGame(doc);
    expect(game.sheets[0]?.getPixel(3, 4)).toBe(9);
    expect(game.maps[0]?.getTile(1, 1)).toBe(7);
    expect(doc.getMap('gfx.sprites').size).toBe(0);
  });
});
