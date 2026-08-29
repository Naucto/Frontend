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

/** 4-connected flood fill inside a w×h region; returns the points to paint. */
export function floodFill(
  get: (x: number, y: number) => number,
  start: Pt,
  w: number,
  h: number,
): Pt[] {
  const target = get(start.x, start.y);
  const seen = new Uint8Array(w * h);
  const out: Pt[] = [];
  const stack: Pt[] = [start];
  while (stack.length) {
    const p = stack.pop();
    if (!p) break;
    if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue;
    const i = p.y * w + p.x;
    if (seen[i]) continue;
    seen[i] = 1;
    if (get(p.x, p.y) !== target) continue;
    out.push(p);
    stack.push(
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    );
  }
  return out;
}

/** Paint a checkerboard (transparent indicator) on a 2d context. */
export function checkerboard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cell: number,
  a: string,
  b: string,
): void {
  ctx.fillStyle = a;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = b;
  for (let y = 0; y < h; y += cell)
    for (let x = (y / cell) % 2 === 0 ? 0 : cell; x < w; x += cell * 2)
      ctx.fillRect(x, y, cell, cell);
}

export function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
