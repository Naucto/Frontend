import { SPRITE_SIZE } from './keys';
import { matchesCall, skipDead, splitArgs } from './luaScan';
import type { SheetShape } from './Sheet';

/**
 * Old sprite number to new one, for every number that still names a cell.
 *
 * A number missing from it names a cell that is gone. A number equal to itself is left out too —
 * the map only carries what moves, so an empty map means nothing has to be rewritten at all.
 */
export type SpriteRemap = ReadonlyMap<number, number>;

/** The shape a sheet is, before or after: enough to say where each of its cells sits. */
type Shape = Pick<SheetShape, 'id' | 'width' | 'height' | 'base'>;

const cellsOf = (s: Shape): { cols: number; rows: number } => ({
  cols: s.width / SPRITE_SIZE,
  rows: s.height / SPRITE_SIZE,
});

/**
 * What every sprite number becomes when the sheets change shape: pixels keep their position, so the
 * grid re-flows, later sheets shift, and cells outside the new shape are left out.
 */
export function remapSprites(before: readonly Shape[], after: readonly Shape[]): SpriteRemap {
  const now = new Map(after.map((s) => [s.id, s]));
  const moves = new Map<number, number>();
  for (const was of before) {
    const is = now.get(was.id);
    const old = cellsOf(was);
    if (!is) continue;
    const next = cellsOf(is);
    for (let row = 0; row < old.rows; row++)
      for (let col = 0; col < old.cols; col++) {
        if (col >= next.cols || row >= next.rows) continue;
        const from = was.base + row * old.cols + col;
        const to = is.base + row * next.cols + col;
        if (from !== to) moves.set(from, to);
      }
  }

  return moves;
}

/** Whether a sprite number still names a cell after the change. */
export function survives(n: number, before: readonly Shape[], after: readonly Shape[]): boolean {
  const was = before.find((s) => n >= s.base && n < s.base + cellsOf(s).cols * cellsOf(s).rows);
  if (!was) return false;
  const is = after.find((s) => s.id === was.id);
  if (!is) return false;
  const old = cellsOf(was);
  const next = cellsOf(is);
  const local = n - was.base;

  return local % old.cols < next.cols && Math.floor(local / old.cols) < next.rows;
}

/** The calls that take a sprite number, and the argument it sits at. */
const CALLS: readonly { name: string; arg: number }[] = [
  { name: 'gfx.draw_sprite', arg: 0 },
  { name: 'sprite', arg: 0 },
  { name: 'map.set', arg: 2 },
  { name: 'map.flag', arg: 0 },
  { name: 'fget', arg: 0 },
];

export interface Rewrite {
  text: string;
  /** Calls whose number was moved to a new one. */
  changed: number;
  /**
   * Calls that name a sprite through an expression known only at run time, so counted rather than
   * rewritten.
   */
  unsure: number;
}

/**
 * Rewrites the sprite numbers written as literals into a Lua source, scanning so a half-typed file
 * still works.
 */
export function rewriteSpriteNumbers(source: string, remap: SpriteRemap): Rewrite {
  let out = '';
  let changed = 0;
  let unsure = 0;
  let i = 0;
  while (i < source.length) {
    const skipped = skipDead(source, i);
    if (skipped > i) {
      out += source.slice(i, skipped);
      i = skipped;
      continue;
    }
    const call = CALLS.find((c) => matchesCall(source, i, c.name));
    if (!call) {
      out += source.slice(i, i + 1);
      i += 1;
      continue;
    }
    const open = source.indexOf('(', i + call.name.length);
    out += source.slice(i, open + 1);
    i = open + 1;
    const args = splitArgs(source, i);
    if (!args) continue;
    const wanted = args.parts[call.arg];
    if (wanted === undefined) {
      out += source.slice(i, args.end);
      i = args.end;
      continue;
    }
    const literal = /^\s*(\d+)\s*$/.exec(wanted);
    if (!literal) {
      unsure += 1;
      out += source.slice(i, args.end);
      i = args.end;
      continue;
    }
    const from = Number(literal[1]);
    const to = remap.get(from);
    if (to !== undefined) {
      changed += 1;
      args.parts[call.arg] = wanted.replace(String(from), String(to));
    }
    out += args.parts.join(',');
    i = args.end;
  }

  return { text: out, changed, unsure };
}
