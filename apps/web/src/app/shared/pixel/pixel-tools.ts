export interface Pt {
  x: number;
  y: number;
}

/** Bresenham line, inclusive of both ends. */
export function linePoints(a: Pt, b: Pt): Pt[] {
  const out: Pt[] = [];
  let { x: x0, y: y0 } = a;
  const { x: x1, y: y1 } = b;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return out;
}

/** Rectangle outline (or filled) between two corners, inclusive. */
export function rectPoints(a: Pt, b: Pt, filled = false): Pt[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const out: Pt[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (filled || x === x0 || x === x1 || y === y0 || y === y1) out.push({ x, y });
  return out;
}

/** Midpoint ellipse fitted to the rectangle between two corners. */
export function ellipsePoints(a: Pt, b: Pt): Pt[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const rx = (x1 - x0) / 2;
  const ry = (y1 - y0) / 2;
  const cx = x0 + rx;
  const cy = y0 + ry;
  if (rx < 1 || ry < 1) return rectPoints(a, b);
  const set = new Set<string>();
  const out: Pt[] = [];
  const push = (x: number, y: number): void => {
    const k = `${String(x)},${String(y)}`;
    if (!set.has(k)) {
      set.add(k);
      out.push({ x, y });
    }
  };
  const steps = Math.max(32, Math.ceil((rx + ry) * 4));
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    push(Math.round(cx + rx * Math.cos(t)), Math.round(cy + ry * Math.sin(t)));
  }
  return out;
}

/**
 * 4-connected flood fill inside a w×h region; returns the points to paint.
 *
 * The frontier is a stack of cell indices, not of points: a region is visited once per cell but
 * pushed once per edge into it, and an object for each of those is most of what a fill of a
 * 256×256 map used to cost. A cell is marked when pushed, so the stack never holds more cells
 * than the region has.
 */
export function floodFill(
  get: (x: number, y: number) => number,
  start: Pt,
  w: number,
  h: number,
): Pt[] {
  if (start.x < 0 || start.y < 0 || start.x >= w || start.y >= h) return [];
  const target = get(start.x, start.y);
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Pt[] = [];
  let top = 0;
  stack[top++] = start.y * w + start.x;
  seen[start.y * w + start.x] = 1;
  const visit = (i: number): void => {
    if (!seen[i]) {
      seen[i] = 1;
      stack[top++] = i;
    }
  };
  while (top > 0) {
    const i = stack[--top] ?? 0;
    const x = i % w;
    const y = (i - x) / w;
    if (get(x, y) !== target) continue;
    out.push({ x, y });
    if (x + 1 < w) visit(i + 1);
    if (x > 0) visit(i - 1);
    if (y + 1 < h) visit(i + w);
    if (y > 0) visit(i - w);
  }
  return out;
}

export type Transform = 'flipH' | 'flipV' | 'rotateCw' | 'rotateCcw';

/** A rectangle of cells in row-major order: the pixels of a sheet or the tiles of a map alike. */
export interface Block<T extends Uint8Array | Uint16Array> {
  cells: T;
  w: number;
  h: number;
}

/**
 * The block flipped, or turned by a quarter.
 *
 * A rotation swaps `w` and `h`, and the result says nothing about where it lands: a turned
 * selection no longer fits the rectangle it was lifted from, and where the new one goes -- kept
 * to its top-left corner, clamped to the sheet -- is the caller's decision. Allocated through the
 * input's own constructor so 8-bit pixels and 16-bit tiles go through the one loop.
 */
export function transformBlock<T extends Uint8Array | Uint16Array>(
  b: Block<T>,
  op: Transform,
): Block<T> {
  const turned = op === 'rotateCw' || op === 'rotateCcw';
  const w = turned ? b.h : b.w;
  const h = turned ? b.w : b.h;
  const cells = new (b.cells.constructor as new (n: number) => T)(w * h);
  const dest = (x: number, y: number): number => {
    switch (op) {
      case 'flipH':
        return y * w + (b.w - 1 - x);
      case 'flipV':
        return (b.h - 1 - y) * w + x;
      case 'rotateCw':
        return x * w + (b.h - 1 - y);
      case 'rotateCcw':
        return (b.w - 1 - x) * w + y;
    }
  };
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) cells[dest(x, y)] = b.cells[y * b.w + x] ?? 0;
  return { cells, w, h };
}

/**
 * One tile of the check, kept per size and colour pair.
 *
 * The board is two colours repeating on a fixed grid, which is what a pattern is: the browser
 * repeats it from a single fill, where naming each square costs a call per square of the surface.
 */
const TILES = new Map<string, HTMLCanvasElement>();

function checkerTile(cell: number, a: string, b: string): HTMLCanvasElement {
  const key = `${String(cell)}|${a}|${b}`;
  const cached = TILES.get(key);
  if (cached) return cached;
  const tile = document.createElement('canvas');
  tile.width = cell * 2;
  tile.height = cell * 2;
  const tctx = tile.getContext('2d');
  if (tctx) {
    tctx.fillStyle = a;
    tctx.fillRect(0, 0, cell * 2, cell * 2);
    tctx.fillStyle = b;
    tctx.fillRect(0, 0, cell, cell);
    tctx.fillRect(cell, cell, cell, cell);
  }
  TILES.set(key, tile);
  return tile;
}

/**
 * Paint a checkerboard (transparent indicator) on a 2d context.
 *
 * Anchored to the current origin, so a caller that has translated gets the board lined up with
 * what it translated to rather than with the canvas.
 */
export function checkerboard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cell: number,
  a: string,
  b: string,
): void {
  const pattern = cell > 0 ? ctx.createPattern(checkerTile(cell, a, b), 'repeat') : null;
  if (!pattern) {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
}

export function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
