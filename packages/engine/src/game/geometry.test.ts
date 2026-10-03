import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { blankGame } from './blank-game';
import { EditableGame } from './EditableGame';
import { DEFAULT_GEOMETRY } from './geometry';
import { FIRST_SHEET_ID } from './keys';

function gameWithPixels(): EditableGame {
  const game = blankGame();
  game.transact(() => {
    game.sheets[0]?.setPixel(4, 4, 7);
    game.sheets[0]?.setPixel(100, 100, 3);
    game.sheets[0]?.setFlag(200, 5);
    game.maps[0]?.setTile(10, 10, 42);
  });
  return game;
}

describe('a document that records no size', () => {
  /** Every game written before sizes were recorded is this one, so it must not move a pixel. */
  it('reads as the sheet and map every game used to have', () => {
    const game = blankGame();

    expect(game.geometry).toEqual(DEFAULT_GEOMETRY);
    expect(game.geometry.sheetWidth).toBe(128);
    expect(game.geometry.sheetHeight).toBe(128);
    expect(game.geometry.spriteCount).toBe(256);
    expect(game.geometry.mapWidth).toBe(128);
    expect(game.geometry.mapHeight).toBe(32);
  });
});

describe('resizing', () => {
  it('snaps a sheet to whole sprites and holds it inside its range', () => {
    const game = blankGame();

    game.resizeSheet(FIRST_SHEET_ID, 100, 9999);

    expect(game.geometry.sheetWidth).toBe(104);
    expect(game.geometry.sheetHeight).toBe(256);
  });

  it('reshapes the mirrors and keeps what is still inside', () => {
    const game = gameWithPixels();

    game.resizeSheet(FIRST_SHEET_ID, 256, 64);

    expect(game.sheets[0]?.pixels).toHaveLength(256 * 64);
    expect(game.sheets[0]?.getPixel(4, 4)).toBe(7);
    // Row 100 is off a sheet 64 tall, so it is out of reach -- not gone, out of reach.
    expect(game.sheets[0]?.getPixel(100, 100)).toBe(0);
  });

  /** What falls outside a shrunk sheet stays in the document. */
  it('gives back everything when a sheet grows to where it was', () => {
    const game = gameWithPixels();
    const before = Y.encodeStateAsUpdate(game.doc);

    game.resizeSheet(FIRST_SHEET_ID, 64, 64);
    expect(game.sheets[0]?.getPixel(100, 100)).toBe(0);
    game.resizeSheet(FIRST_SHEET_ID, 128, 128);

    expect(game.sheets[0]?.getPixel(100, 100)).toBe(3);
    expect(game.sheets[0]?.getPixel(4, 4)).toBe(7);
    const replayed = new Y.Doc();
    Y.applyUpdate(replayed, before);
    Y.applyUpdate(replayed, Y.encodeStateAsUpdate(game.doc));
    const round = new EditableGame(replayed);
    expect(round.sheets[0]?.getPixel(100, 100)).toBe(3);
  });

  it('lets a bigger sheet hold sprite numbers a map can now name', () => {
    const game = blankGame();

    game.resizeSheet(FIRST_SHEET_ID, 256, 256);
    game.maps[0]?.setTile(0, 0, 1000);

    expect(game.geometry.spriteCount).toBe(1024);
    // Tiles hold sixteen bits.
    expect(game.maps[0]?.getTile(0, 0)).toBe(1000);
  });

  it('tells its listeners, because every mirror they hold has been replaced', () => {
    const game = blankGame();
    let told = 0;
    game.onGeometryChange(() => {
      told++;
    });

    game.resizeSheet(FIRST_SHEET_ID, 64, game.geometry.sheetHeight);
    game.resizeSheet(FIRST_SHEET_ID, 64, game.geometry.sheetHeight);

    expect(told).toBe(1);
  });
});
