import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from './Game';
import { DEFAULT_GEOMETRY } from './geometry';

function gameWithPixels(): Game {
  const game = new Game(new Y.Doc());
  game.transact(() => {
    game.setPixel(4, 4, 7);
    game.setPixel(100, 100, 3);
    game.setFlag(200, 5);
    game.setTile(10, 10, 42);
  });
  return game;
}

describe('a document that records no size', () => {
  /** Every game written before sizes were recorded is this one, so it must not move a pixel. */
  it('reads as the sheet and map every game used to have', () => {
    const game = new Game(new Y.Doc());

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
    const game = new Game(new Y.Doc());

    game.resize({ sheetWidth: 100, sheetHeight: 9999 });

    expect(game.geometry.sheetWidth).toBe(104);
    expect(game.geometry.sheetHeight).toBe(256);
  });

  it('reshapes the mirrors and keeps what is still inside', () => {
    const game = gameWithPixels();

    game.resize({ sheetWidth: 256, sheetHeight: 64 });

    expect(game.sheet).toHaveLength(256 * 64);
    expect(game.getPixel(4, 4)).toBe(7);
    // Row 100 is off a sheet 64 tall, so it is out of reach -- not gone, out of reach.
    expect(game.getPixel(100, 100)).toBe(0);
  });

  /**
   * The promise the shrink warning makes: what falls outside stays in the document. Break this and
   * the warning becomes a lie, and a mis-typed number costs somebody their art.
   */
  it('gives back everything when a sheet grows to where it was', () => {
    const game = gameWithPixels();
    const before = Y.encodeStateAsUpdate(game.doc);

    game.resize({ sheetWidth: 64, sheetHeight: 64 });
    expect(game.getPixel(100, 100)).toBe(0);
    game.resize({ sheetWidth: 128, sheetHeight: 128 });

    expect(game.getPixel(100, 100)).toBe(3);
    expect(game.getPixel(4, 4)).toBe(7);
    // Only the size was ever written, so replaying the original state changes nothing back.
    const replayed = new Y.Doc();
    Y.applyUpdate(replayed, before);
    Y.applyUpdate(replayed, Y.encodeStateAsUpdate(game.doc));
    const round = new Game(replayed);
    expect(round.getPixel(100, 100)).toBe(3);
  });

  it('lets a bigger sheet hold sprite numbers a map can now name', () => {
    const game = new Game(new Y.Doc());

    game.resize({ sheetWidth: 256, sheetHeight: 256 });
    game.setTile(0, 0, 1000);

    expect(game.geometry.spriteCount).toBe(1024);
    // A byte would have folded this to 232; the map holds sixteen bits now.
    expect(game.getTile(0, 0)).toBe(1000);
  });

  it('tells its listeners, because every mirror they hold has been replaced', () => {
    const game = new Game(new Y.Doc());
    let told = 0;
    game.onGeometryChange(() => {
      told++;
    });

    game.resize({ sheetWidth: 64 });
    game.resize({ sheetWidth: 64 });

    expect(told).toBe(1);
  });
});
