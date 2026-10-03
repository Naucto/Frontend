import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from './EditableGame';
import { Game } from './Game';
import { FIRST_MAP_ID, FIRST_SHEET_ID, KEYS, MAP_WIDTH, SHEET_WIDTH } from './keys';

/** The cells one entry of a collection holds under a field. */
function cellsOn(doc: Y.Doc, collection: string, id: string, field: string): Y.Map<number> {
  return doc.getMap<Y.Map<unknown>>(collection).get(id)?.get(field) as Y.Map<number>;
}

/**
 * Every sheet and every map is an entry of its collection holding its own cells and size: nothing
 * sits in the document roots or on the meta, and nothing is read from them.
 */
describe('the shape a game document is written in', () => {
  it('seeds a new game with a first sheet and a first map, sized on their entries', () => {
    const doc = new Y.Doc();
    new EditableGame(doc).seedDefaults();

    const sheet = doc.getMap<Y.Map<unknown>>(KEYS.sheets).get(FIRST_SHEET_ID);
    const map = doc.getMap<Y.Map<unknown>>(KEYS.maps).get(FIRST_MAP_ID);
    expect(sheet?.get('w')).toBe(SHEET_WIDTH);
    expect(map?.get('w')).toBe(MAP_WIDTH);
    // The starter player is drawn on the first sheet's own cells.
    expect(cellsOn(doc, KEYS.sheets, FIRST_SHEET_ID, 'pixels').size).toBeGreaterThan(0);
    expect([...doc.share.keys()]).not.toContain('gfx.sprites');
    expect(doc.getMap(KEYS.meta).has('sheetWidth')).toBe(false);
  });

  it('writes the first sheet and map on their entries, and a peer reads them there', () => {
    const doc = new Y.Doc();
    const game = new EditableGame(doc);
    game.seedDefaults();

    game.sheets[0]?.setPixel(3, 4, 9);
    game.sheets[0]?.setFlag(7, 3);
    game.maps[0]?.setTile(1, 1, 7);

    expect(cellsOn(doc, KEYS.sheets, FIRST_SHEET_ID, 'pixels').get('3,4')).toBe(9);
    expect(cellsOn(doc, KEYS.sheets, FIRST_SHEET_ID, 'flags').get('7')).toBe(3);
    expect(cellsOn(doc, KEYS.maps, FIRST_MAP_ID, 'tiles').get('1,1')).toBe(7);
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    const there = new Game(remote);
    expect(there.sheets[0]?.getPixel(3, 4)).toBe(9);
    expect(there.flagOf(7)).toBe(3);
    expect(there.maps[0]?.getTile(1, 1)).toBe(7);
  });

  it('reads nothing from the roots or the meta sizes the first schema used', () => {
    const doc = new Y.Doc();
    new EditableGame(doc).seedDefaults();
    doc.getMap<number>('gfx.sprites').set('5,5', 2);
    doc.getMap<number>('map.tiles').set('2,2', 4);
    doc.getMap(KEYS.meta).set('sheetWidth', 64);

    const game = new Game(doc);

    expect(game.sheets[0]?.getPixel(5, 5)).toBe(0);
    expect(game.maps[0]?.getTile(2, 2)).toBe(0);
    expect(game.sheets[0]?.width).toBe(SHEET_WIDTH);
  });
});
