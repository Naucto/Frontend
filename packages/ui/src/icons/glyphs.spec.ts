import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { glyphPath } from './glyph-path';
import { ICON_GLYPHS, MARK_GLYPHS } from './glyphs';

const PIXEL = 3;

/** The drawings of a source as its file writes them: the rows of cells under each name. */
function drawings(file: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  let rows: string[] = [];
  for (const line of readFileSync(resolve(import.meta.dirname, file), 'utf8').split('\n')) {
    const name = /^([a-z0-9-]+):/.exec(line)?.[1];
    if (name) {
      rows = [];
      found.set(name, rows);
    } else if (/^[.#]+$/.test(line)) {
      rows.push(line);
    }
  }
  return found;
}

/** What a path of rectangles paints in a box `side` pixels across, a character a pixel. */
function painted(path: string, side: number): string[] {
  const pixels = Array.from({ length: side }, () => Array<string>(side).fill('.'));
  const rectangle = /M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g;
  for (const [, x, y, width, height] of path.matchAll(rectangle)) {
    for (let row = Number(y); row < Number(y) + Number(height); row++) {
      for (let column = Number(x); column < Number(x) + Number(width); column++) {
        const line = pixels[row];
        if (!line || column >= side) {
          throw new Error(`the path leaves its box at ${String(column)},${String(row)}`);
        }
        line[column] = '#';
      }
    }
  }
  expect(path.replace(rectangle, ''), 'the path holds something other than rectangles').toBe('');
  return pixels.map((line) => line.join(''));
}

/**
 * What a drawing has to paint in a box of `box` cells: every cell a square of three pixels, the
 * drawing in the middle of the box, and a whole pixel before the middle where that falls on half
 * of one.
 */
function squares(rows: readonly string[], box: number): string[] {
  const side = box * PIXEL;
  const left = Math.floor((side - (rows[0]?.length ?? 0) * PIXEL) / 2);
  const top = Math.floor((side - rows.length * PIXEL) / 2);
  return Array.from({ length: side }, (_, y) =>
    Array.from({ length: side }, (_, x) => {
      const row = rows[Math.floor((y - top) / PIXEL)];
      return y >= top && x >= left && row?.[Math.floor((x - left) / PIXEL)] === '#' ? '#' : '.';
    }).join(''),
  );
}

const SOURCES: readonly [file: string, box: number, table: Record<string, string>][] = [
  ['icons-24.txt', 8, ICON_GLYPHS[24]],
  ['icons-36.txt', 12, ICON_GLYPHS[36]],
  ['marks.txt', 5, MARK_GLYPHS],
];

describe.each(SOURCES)('%s', (file, box, table) => {
  const drawn = drawings(file);

  it('is what the table was built from, name for name', () => {
    expect(Object.keys(table).sort()).toEqual([...drawn.keys()].sort());
  });

  it('holds no drawing larger than its box', () => {
    const large = [...drawn].filter(
      ([, rows]) => rows.length > box || rows.some((row) => row.length > box),
    );
    expect(large.map(([name]) => name)).toEqual([]);
  });

  it.each([...drawn])('%s is painted cell for cell, on whole pixels', (name, rows) => {
    expect(painted(glyphPath(table[name] ?? '', box), box * PIXEL)).toEqual(squares(rows, box));
  });
});

it('draws every icon at both sizes', () => {
  expect(Object.keys(ICON_GLYPHS[36])).toEqual(Object.keys(ICON_GLYPHS[24]));
});

it('sets a drawing an odd count of cells across a pixel before the middle of its box', () => {
  const plus = painted(glyphPath(ICON_GLYPHS[24].plus, 8), 24);
  expect(plus[12]).toBe(`.${'#'.repeat(21)}..`);
});
