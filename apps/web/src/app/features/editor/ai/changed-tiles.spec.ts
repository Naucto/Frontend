import { GameMap } from '@naucto/engine';
import { describe, expect, it } from 'vitest';

import { changedTiles, markerBox } from './ai-proposals.component';

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

  it('compares by coordinate, so a resize with no edits reports nothing', () => {
    // `tiles` is dense and row-major at each map's own width, so reading the before-map with the
    // after-map's width compares unrelated cells: a pure growth reported painted cells as changed and
    // a real edit further along as untouched. `resize_map` is a first-class operation, so a proposal
    // containing one reaches this.
    const grown = changedTiles(mapOf(2, 2, [1, 2, 5, 6]), mapOf(4, 2, [1, 2, 0, 0, 5, 6, 0, 0]));
    expect(grown).toEqual([]);

    const shrunk = changedTiles(mapOf(4, 2, [1, 2, 0, 0, 5, 6, 0, 0]), mapOf(2, 2, [1, 2, 5, 6]));
    expect(shrunk).toEqual([]);

    // And a resize that also moves one tile reports exactly that one.
    const both = changedTiles(mapOf(2, 2, [1, 2, 5, 6]), mapOf(4, 2, [1, 2, 0, 0, 9, 6, 0, 0]));
    expect(both).toEqual([{ x: 0, y: 1 }]);
  });

  it('says nothing when neither version has the map, or when nothing changed', () => {
    expect(changedTiles(undefined, undefined)).toEqual([]);
    expect(changedTiles(mapOf(2, 2, [1, 2, 3, 4]), mapOf(2, 2, [1, 2, 3, 4]))).toEqual([]);
  });
});

describe('where a map marker sits', () => {
  const map = { tileColumns: 128, tileRows: 32 };

  it('scales each axis by its own dimension', () => {
    // The default map is 128 by 32, so a marker scaled by the width in both directions would put a
    // row near the bottom in the middle and make every marker a quarter of the height it should be.
    const bottom = markerBox(map, { x: 0, y: 31 });
    expect(bottom.top).toBeCloseTo(96.875);
    expect(bottom.width).toBeCloseTo(0.78125);
    expect(bottom.height).toBeCloseTo(3.125);
    expect(markerBox(map, { x: 0, y: 0 }).top).toBe(0);
  });

  it('places a marker on the cell it names, not on the last one', () => {
    expect(markerBox(map, { x: 5, y: 2 }).left).toBeCloseTo(3.90625);
    expect(markerBox(map, { x: 5, y: 2 }).top).toBeCloseTo(6.25);
  });

  it('draws nothing measurable when the map has no size', () => {
    expect(markerBox({ tileColumns: 0, tileRows: 0 }, { x: 1, y: 1 })).toEqual({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    });
  });
});
