import { describe, expect, it } from 'vitest';

import { ellipsePoints, floodFill, linePoints, rectPoints } from './pixel-tools';

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
