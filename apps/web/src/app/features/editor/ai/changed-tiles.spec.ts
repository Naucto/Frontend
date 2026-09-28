import { GameMap } from '@naucto/engine';
import { describe, expect, it } from 'vitest';

import { changedTiles } from './ai-proposals.component';

/** A map of a given size with its cells filled in. Nothing here writes, so the writer is inert. */
const mapOf = (width: number, height: number, tiles: number[]): GameMap =>
  new GameMap('m', 'm', 0, width, height, null, Uint16Array.from(tiles), {
    setTile: () => undefined,
  });

describe('where a map change is', () => {
  it('names the cells whose tile changed, in the map own coordinates', () => {
    expect(
      changedTiles(mapOf(4, 2, [0, 0, 0, 0, 0, 5, 0, 0]), mapOf(4, 2, [0, 7, 0, 0, 0, 5, 0, 0])),
    ).toEqual([{ x: 1, y: 0 }]);
  });

  it('calls a tile cleared to nothing a change, not an unchanged one', () => {
    // Something drawn is something removed: reading only the tiles a proposal rewrote would report a
    // removal as no change at all, and the reviewer would be shown a map that looks untouched.
    expect(changedTiles(mapOf(3, 1, [1, 2, 3]), mapOf(3, 1, [1, 0, 3]))).toEqual([{ x: 1, y: 0 }]);
  });

  it('names every cell of a map that is new or gone', () => {
    expect(changedTiles(undefined, mapOf(2, 1, [1, 1]))).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
    expect(changedTiles(mapOf(2, 1, [1, 1]), undefined)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ]);
  });

  it('says nothing when neither version has the map, or when nothing changed', () => {
    expect(changedTiles(undefined, undefined)).toEqual([]);
    expect(changedTiles(mapOf(2, 2, [1, 2, 3, 4]), mapOf(2, 2, [1, 2, 3, 4]))).toEqual([]);
  });
});
