import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from './Game';
import { FIRST_MAP_ID, FIRST_SHEET_ID, KEYS } from './keys';
import { computeSizeReport } from './size';

/** Declares a sheet the way the collection holds one, without its own pixels. */
function declareSheet(doc: Y.Doc, id: string, order: number, w: number, h: number): void {
  const entry = new Y.Map<unknown>();
  doc.getMap<Y.Map<unknown>>(KEYS.sheets).set(id, entry);
  entry.set('name', id);
  entry.set('order', order);
  entry.set('w', w);
  entry.set('h', h);
}

describe('a document that names no sheets', () => {
  /** Every game written so far. It has one sheet, and saying otherwise would strand its art. */
  it('has exactly the sheet and the map its geometry describes', () => {
    const game = new Game(new Y.Doc());

    expect(game.sheets).toHaveLength(1);
    const [sheet] = game.sheets;
    expect(sheet?.id).toBe(FIRST_SHEET_ID);
    expect(sheet?.base).toBe(0);
    expect(sheet?.count).toBe(256);
    expect(sheet?.pixels).toBe(game.sheet);

    expect(game.maps).toHaveLength(1);
    expect(game.maps[0]?.id).toBe(FIRST_MAP_ID);
    expect(game.maps[0]?.tiles).toBe(game.tiles);
  });

  it('numbers its sprites exactly as it always did', () => {
    const game = new Game(new Y.Doc());

    expect(game.spriteOrigin(0)).toEqual({ x: 0, y: 0 });
    expect(game.spriteOrigin(17)).toEqual({ x: 8, y: 8 });
    expect(game.spriteTotal).toBe(256);
  });
});

describe('sprite numbers across several sheets', () => {
  it('runs on from one sheet to the next', () => {
    const doc = new Y.Doc();
    declareSheet(doc, FIRST_SHEET_ID, 0, 128, 128);
    declareSheet(doc, 'b', 1, 64, 64);
    const game = new Game(doc);

    const [first, second] = game.sheets;
    expect(first?.base).toBe(0);
    expect(first?.count).toBe(256);
    // What the promise is: the next sheet starts where the previous one stopped.
    expect(second?.base).toBe(256);
    expect(second?.count).toBe(64);
    expect(game.spriteTotal).toBe(320);
  });

  it('sends a number to the sheet that claims it, and to its own corner', () => {
    const doc = new Y.Doc();
    declareSheet(doc, FIRST_SHEET_ID, 0, 128, 128);
    declareSheet(doc, 'b', 1, 64, 64);
    const game = new Game(doc);

    expect(game.sheetOf(255)?.id).toBe(FIRST_SHEET_ID);
    expect(game.sheetOf(256)?.id).toBe('b');
    // 256 is the second sheet's first cell, so it sits at its origin rather than 32 rows down.
    expect(game.spriteOrigin(256)).toEqual({ x: 0, y: 0 });
    expect(game.spriteOrigin(265)).toEqual({ x: 8, y: 8 });
  });

  it('claims nothing for a number past the last sheet', () => {
    const doc = new Y.Doc();
    declareSheet(doc, FIRST_SHEET_ID, 0, 128, 128);
    const game = new Game(doc);

    expect(game.sheetOf(256)).toBeUndefined();
    expect(game.isSpriteEmpty(256)).toBe(true);
  });

  it('orders sheets the way it orders code files', () => {
    const doc = new Y.Doc();
    declareSheet(doc, 'z', 0, 64, 64);
    declareSheet(doc, FIRST_SHEET_ID, 1, 128, 128);
    const game = new Game(doc);

    expect(game.sheets.map((s) => s.id)).toEqual(['z', FIRST_SHEET_ID]);
    expect(game.sheets[1]?.base).toBe(64);
  });
});

describe('adding and drawing on a second sheet', () => {
  it('writes the first sheet down before it can hold a second', () => {
    const game = new Game(new Y.Doc());

    game.addSheet('extra', 64, 64, 'x');

    expect(game.sheetsMap.size).toBe(2);
    expect(game.sheets.map((s) => s.id)).toEqual([FIRST_SHEET_ID, 'x']);
    // The first sheet keeps the numbers it had, and the new one carries on.
    expect(game.sheets[0]?.base).toBe(0);
    expect(game.sheets[1]?.base).toBe(256);
  });

  it('keeps a second sheet apart from the first', () => {
    const game = new Game(new Y.Doc());
    game.addSheet('extra', 64, 64, 'x');

    game.sheets[1]?.setPixel(3, 4, 9);

    expect(game.sheets[1]?.getPixel(3, 4)).toBe(9);
    // The pixel went to the new sheet's own map, not into the roots the first sheet lives in.
    expect(game.getPixel(3, 4)).toBe(0);
    expect(game.spritesMap.size).toBe(0);
  });

  it('tells the drawing listeners, so a stroke from a peer reaches the screen', () => {
    const game = new Game(new Y.Doc());
    game.addSheet('extra', 64, 64, 'x');
    let seen = 0;
    game.onPixelsChange((changes) => {
      seen += changes.length;
    });

    game.sheets[1]?.setPixel(1, 1, 5);

    expect(seen).toBe(1);
  });

  it('numbers flags within the sheet that holds them', () => {
    const game = new Game(new Y.Doc());
    game.addSheet('extra', 64, 64, 'x');
    const second = game.sheets[1];

    second?.setFlag(256, 0b11);

    expect(second?.getFlag(256)).toBe(0b11);
    // The first sheet's flag 0 is a different thing entirely.
    expect(game.getFlag(0)).toBe(0);
  });

  it('refuses to remove the only sheet a game has', () => {
    const game = new Game(new Y.Doc());
    game.addSheet('extra', 64, 64, 'x');

    game.removeSheet('x');
    expect(game.sheets).toHaveLength(1);

    game.removeSheet(FIRST_SHEET_ID);
    expect(game.sheets).toHaveLength(1);
  });
});

describe('the rest of the document keeping up', () => {
  it('weighs every sheet, not only the first', () => {
    const game = new Game(new Y.Doc());
    const alone = computeSizeReport(game).sprites;
    game.addSheet('extra', 64, 64, 'x');
    game.sheets[1]?.setPixel(0, 0, 3);

    expect(computeSizeReport(game).sprites).toBe(alone + 1);
  });

  /** Restoring an old version must not leave today's sheets standing beside it. */
  it('takes a snapshot back to the sheets it was taken with', () => {
    const game = new Game(new Y.Doc());
    game.sheets[0]?.setPixel(1, 1, 4);
    const snapshot = Y.encodeStateAsUpdate(game.doc);

    game.addSheet('extra', 64, 64, 'x');
    game.sheets[1]?.setPixel(2, 2, 6);
    expect(game.sheets).toHaveLength(2);

    game.restoreFrom(snapshot);

    expect(game.sheets).toHaveLength(1);
    expect(game.getPixel(1, 1)).toBe(4);
  });

  it('brings a sheet back with its pixels when the snapshot had one', () => {
    const game = new Game(new Y.Doc());
    game.addSheet('extra', 64, 64, 'x');
    game.sheets[1]?.setPixel(2, 2, 6);
    const snapshot = Y.encodeStateAsUpdate(game.doc);

    game.removeSheet('x');
    expect(game.sheets).toHaveLength(1);

    game.restoreFrom(snapshot);

    expect(game.sheets).toHaveLength(2);
    expect(game.sheets[1]?.getPixel(2, 2)).toBe(6);
  });
});
