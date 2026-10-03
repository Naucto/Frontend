import { describe, expect, it } from 'vitest';

import {
  type Block,
  ellipsePoints,
  floodFill,
  linePoints,
  rectPoints,
  transformBlock,
} from './pixel-tools';

const block = (width: number, height: number, cells: number[]): Block<Uint8Array> => ({
  cells: Uint8Array.from(cells),
  w: width,
  h: height,
});

/** The cells as rows, which is how a layout is read off a test. */
const rows = (grid: Block<Uint8Array | Uint16Array>): number[][] =>
  Array.from({ length: grid.h }, (_, y) =>
    Array.from(grid.cells.subarray(y * grid.w, (y + 1) * grid.w)),
  );

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

describe('ellipsePoints', () => {
  it.each([
    [40, 12],
    [12, 40],
    [128, 5],
    [64, 64],
  ])('encloses the centre of a %ix%i box, so a fill inside cannot leak', (width, height) => {
    const outline = new Set(
      ellipsePoints({ x: 0, y: 0 }, { x: width - 1, y: height - 1 }).map(
        (point) => `${String(point.x)},${String(point.y)}`,
      ),
    );
    const seen = new Set<string>();
    const todo: [number, number][] = [[width >> 1, height >> 1]];
    let escaped = false;
    while (todo.length && !escaped) {
      const [x, y] = todo.pop() ?? [0, 0];
      const key = `${String(x)},${String(y)}`;
      if (seen.has(key) || outline.has(key)) {
        continue;
      }
      if (x < 0 || y < 0 || x >= width || y >= height) {
        escaped = true;
      }
      seen.add(key);
      todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    expect(escaped).toBe(false);
  });

  it('falls back to the rectangle outline when too thin to hold a curve', () => {
    const ellipse = ellipsePoints({ x: 0, y: 0 }, { x: 5, y: 0 });
    const rect = rectPoints({ x: 0, y: 0 }, { x: 5, y: 0 });
    expect(new Set(ellipse.map((point) => `${String(point.x)},${String(point.y)}`))).toEqual(
      new Set(rect.map((point) => `${String(point.x)},${String(point.y)}`)),
    );
  });
});

describe('floodFill', () => {
  const grid =
    (rows: number[][]) =>
    (x: number, y: number): number =>
      rows[y]?.[x] ?? -1;

  it('returns nothing for a start outside the region', () => {
    const get = grid([
      [0, 0],
      [0, 0],
    ]);
    expect(floodFill(get, { x: 5, y: 5 }, 2, 2)).toEqual([]);
    expect(floodFill(get, { x: -1, y: 0 }, 2, 2)).toEqual([]);
  });

  it('stops at a wall of a different value', () => {
    const get = grid([
      [1, 1, 2],
      [1, 1, 2],
    ]);
    const filled = floodFill(get, { x: 0, y: 0 }, 3, 2);
    expect(new Set(filled.map((point) => `${String(point.x)},${String(point.y)}`))).toEqual(
      new Set(['0,0', '1,0', '0,1', '1,1']),
    );
  });

  it('fills a full region without throwing or crossing into the next row', () => {
    const width = 256;
    const height = 256;
    const filled = floodFill(() => 0, { x: 0, y: 0 }, width, height);
    expect(filled.length).toBe(width * height);
    for (const point of filled) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThan(width);
    }
  });
});

describe('linePoints', () => {
  it('includes both ends and has max(|dx|,|dy|)+1 points, for horizontal, vertical, steep and reversed lines', () => {
    const cases: [{ x: number; y: number }, { x: number; y: number }][] = [
      [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 5 },
      ],
      [
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      ],
      [
        { x: 5, y: 5 },
        { x: 0, y: 0 },
      ],
    ];
    for (const [from, to] of cases) {
      const pts = linePoints(from, to);
      expect(pts[0]).toEqual(from);
      expect(pts[pts.length - 1]).toEqual(to);
      expect(pts.length).toBe(Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) + 1);
    }
  });
});

describe('rectPoints', () => {
  it('outlines just the border by default', () => {
    const pts = rectPoints({ x: 0, y: 0 }, { x: 3, y: 2 });
    expect(pts.length).toBe(2 * 4 + 2 * 3 - 4);
  });

  it('fills every cell when asked to', () => {
    const pts = rectPoints({ x: 0, y: 0 }, { x: 3, y: 2 }, true);
    expect(pts.length).toBe(4 * 3);
  });
});
