import { describe, expect, it } from 'vitest';

import { type CellSurface, type Edge, FloatingLayer } from './floating-layer';
import { type Rect } from './pixel-tools';

/** A width×height grid of cells, the bounds the whole of it. */
function grid(
  width: number,
  height: number,
  values: number[],
): { surface: CellSurface; rows: () => number[][] } {
  const cells = Uint8Array.from(values);
  const bounds: Rect = { x: 0, y: 0, w: width, h: height };
  return {
    surface: {
      read: (x, y) => cells[y * width + x] ?? 0,
      write: (x, y, value) => {
        if (x >= 0 && y >= 0 && x < width && y < height) {
          cells[y * width + x] = value;
        }
      },
      bounds: () => bounds,
      transact: (edit) => {
        edit();
      },
      undo: () => null,
    },
    rows: () =>
      Array.from({ length: height }, (_, y) =>
        Array.from(cells.subarray(y * width, (y + 1) * width)),
      ),
  };
}

function layerOver(surface: CellSurface, edge: Edge): FloatingLayer<Uint8Array> {
  return new FloatingLayer<Uint8Array>(surface, Uint8Array, edge);
}

describe('FloatingLayer', () => {
  // A 2×1 bar against the right edge of a 3×3 grid; turning it makes it 1×2, which fits.
  // Against the bottom edge instead, it no longer does.
  const bottomBar = [0, 0, 0, 0, 0, 0, 0, 1, 2];
  const turned = { x: 1, y: 2, w: 2, h: 1 };

  it('cuts a turned block at the edge, keeping its corner', () => {
    const { surface, rows } = grid(3, 3, bottomBar);
    const landed = layerOver(surface, 'cut').transform(turned, 'rotateCw');
    expect(landed).toEqual({ x: 1, y: 2, w: 1, h: 1 });
    expect(rows()).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
    ]);
  });

  it('slides a turned block back from the edge, keeping every cell', () => {
    const { surface, rows } = grid(3, 3, bottomBar);
    const landed = layerOver(surface, 'slide').transform(turned, 'rotateCw');
    expect(landed).toEqual({ x: 1, y: 1, w: 1, h: 2 });
    expect(rows()).toEqual([
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
    ]);
  });

  it('leaves the surface alone until a placed block is settled', () => {
    const { surface, rows } = grid(3, 1, [0, 0, 0]);
    const layer = layerOver(surface, 'cut');
    expect(layer.place({ x: 2, y: 0, w: 2, h: 1 }, Uint8Array.from([5, 6]))).toEqual({
      x: 1,
      y: 0,
      w: 2,
      h: 1,
    });
    expect(rows()).toEqual([[0, 0, 0]]);
    expect(layer.carry({ x: -3, y: 0 })).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    expect(layer.settle()).toEqual({ x: 0, y: 0, w: 2, h: 1 });
    expect(rows()).toEqual([[5, 6, 0]]);
    expect(layer.discard()).toBe(false);
  });

  it('moves a block without leaving a copy, dropping what lands outside', () => {
    const { surface, rows } = grid(3, 1, [1, 2, 0]);
    const layer = layerOver(surface, 'cut');
    const rect = { x: 0, y: 0, w: 2, h: 1 };
    layer.move(rect, layer.lift(rect), { x: 2, y: 0 });
    expect(rows()).toEqual([[0, 0, 1]]);
  });
});
