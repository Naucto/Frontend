import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from './Game';
import { FIRST_MAP_ID, FIRST_SHEET_ID, KEYS } from './keys';

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
