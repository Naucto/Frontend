import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { needsMigration } from '../migrations';
import { Game } from './Game';
import {
  GAME_SCHEMA_VERSION,
  KEYS,
  MAP_HEIGHT,
  MAP_WIDTH,
  SHEET_HEIGHT,
  SHEET_WIDTH,
} from './keys';

/**
 * A document written before a game could have several sheets, several maps, or a size of its own.
 *
 * It records no geometry and declares no collections: the pixels sit in the root sprite map and the
 * tiles in the root tile map, which is where the first sheet and the first map still keep theirs.
 */
function writtenBeforeCollections(): Y.Doc {
  const doc = new Y.Doc();
  doc.getMap(KEYS.meta).set('schemaVersion', GAME_SCHEMA_VERSION);
  doc.getMap<number>(KEYS.sprites).set('3,4', 9);
  doc.getMap<number>(KEYS.tiles).set('1,1', 7);

  return doc;
}

/**
 * The shape grew by addition, so nothing has to be rewritten to be read.
 *
 * This is the whole reason there is no migration for it, and the reason a game saved by this build
 * still opens in one from before it: a schema bump would refuse both ways round for a document
 * that reads correctly as it stands.
 */
describe('a document written before sheets were a collection', () => {
  it('is not out of date', () => {
    expect(needsMigration(writtenBeforeCollections())).toBe(false);
  });

  it('reads as one sheet and one map, at the sizes a document without any means', () => {
    const game = new Game(writtenBeforeCollections());

    expect(game.sheets).toHaveLength(1);
    expect(game.maps).toHaveLength(1);
    // Nameless, like every sheet and map that nobody has named: the strip shows the number.
    expect(game.sheets[0]?.name).toBe('');
    expect(game.maps[0]?.name).toBe('');
    expect(game.sheets[0]?.width).toBe(SHEET_WIDTH);
    expect(game.sheets[0]?.height).toBe(SHEET_HEIGHT);
    expect(game.maps[0]?.width).toBe(MAP_WIDTH);
    expect(game.maps[0]?.height).toBe(MAP_HEIGHT);
  });

  it('keeps the pixels and the tiles it was written with', () => {
    const game = new Game(writtenBeforeCollections());

    expect(game.sheets[0]?.getPixel(3, 4)).toBe(9);
    expect(game.maps[0]?.getTile(1, 1)).toBe(7);
    // And the same content through the numbers a game names it by.
    expect(game.getPixel(3, 4)).toBe(9);
    expect(game.getTile(1, 1)).toBe(7);
  });

  /**
   * The first sheet keeps living in the root maps once a second one is added — the collection entry
   * describes it, it does not move it. A document that had its pixels copied somewhere else would
   * be unreadable by anything that came before.
   */
  it('keeps its pixels where they were when a second sheet arrives', () => {
    const doc = writtenBeforeCollections();
    const game = new Game(doc);

    game.addSheet('extra sprites', 64, 64);

    expect(game.sheets).toHaveLength(2);
    expect(game.sheets[0]?.getPixel(3, 4)).toBe(9);
    expect(doc.getMap<number>(KEYS.sprites).get('3,4')).toBe(9);
  });
});
