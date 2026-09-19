import { describe, expect, it } from 'vitest';

import { type Block, transformBlock } from './pixel-tools';

const block = (w: number, h: number, cells: number[]): Block<Uint8Array> => ({
  cells: Uint8Array.from(cells),
  w,
  h,
});

/** The cells as rows, which is how a layout is read off a test. */
const rows = (b: Block<Uint8Array | Uint16Array>): number[][] =>
  Array.from({ length: b.h }, (_, y) => Array.from(b.cells.subarray(y * b.w, (y + 1) * b.w)));

describe('transformBlock', () => {
  const abc = block(3, 2, [1, 2, 3, 4, 5, 6]);

  it('mirrors left to right', () => {
    const out = transformBlock(abc, 'flipH');
    expect([out.w, out.h]).toEqual([3, 2]);
    expect(rows(out)).toEqual([
      [3, 2, 1],
      [6, 5, 4],
    ]);
  });

  it('mirrors top to bottom', () => {
    const out = transformBlock(abc, 'flipV');
    expect([out.w, out.h]).toEqual([3, 2]);
    expect(rows(out)).toEqual([
      [4, 5, 6],
      [1, 2, 3],
    ]);
  });

  it('turns a quarter clockwise, so the top row becomes the right column', () => {
    const out = transformBlock(abc, 'rotateCw');
    expect([out.w, out.h]).toEqual([2, 3]);
    expect(rows(out)).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ]);
  });

  it('turns a quarter counter-clockwise, so the top row becomes the left column', () => {
    const out = transformBlock(abc, 'rotateCcw');
    expect([out.w, out.h]).toEqual([2, 3]);
    expect(rows(out)).toEqual([
      [3, 6],
      [2, 5],
      [1, 4],
    ]);
  });

  it('turns twice to the same place as both mirrors', () => {
    const twice = transformBlock(transformBlock(abc, 'rotateCw'), 'rotateCw');
    const mirrored = transformBlock(transformBlock(abc, 'flipH'), 'flipV');
    expect(rows(twice)).toEqual(rows(mirrored));
  });

  it('turns back to where it started', () => {
    const back = transformBlock(transformBlock(abc, 'rotateCw'), 'rotateCcw');
    expect([back.w, back.h]).toEqual([3, 2]);
    expect(rows(back)).toEqual(rows(abc));
  });

  it('keeps tile numbers above 255 in a 16-bit block', () => {
    const tiles: Block<Uint16Array> = {
      cells: Uint16Array.from([300, 1000, 65535, 0]),
      w: 2,
      h: 2,
    };
    const out = transformBlock(tiles, 'rotateCw');
    expect(out.cells).toBeInstanceOf(Uint16Array);
    expect(rows(out)).toEqual([
      [65535, 300],
      [0, 1000],
    ]);
  });
});
