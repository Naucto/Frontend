import { SPRITE_SIZE } from './keys';
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
 * What every sprite number becomes when the sheets change shape.
 *
 * A sheet's pixels are stored by position, not by cell, so resizing one keeps the picture and
 * re-flows the grid over it: at sixteen columns the cell at column one of row one is number 17, and
 * at twenty-four columns the same cell is number 25. Every sheet after it shifts as well, because
 * numbers run on from one sheet to the next.
 *
 * A cell that falls outside the new shape has no number at all, and is left out.
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

/**
 * Where a Lua source names a sprite number, and in which argument.
 *
 * Only the calls that take one, and only at the position they take it: `map.set(tx, ty, n)` counts
 * its third, and rewriting its first would move tiles about instead of renumbering them.
 */
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
   * Calls that name a sprite through something other than a plain number.
   *
   * Nothing can be done for these — the value is only known while the game runs — so they are
   * counted and reported rather than guessed at.
   */
  unsure: number;
}

/**
 * Rewrites the sprite numbers written into a Lua source.
 *
 * Scanned rather than parsed: the only parser in the tree throws on incomplete code, which is the
 * state a file in an editor is in most of the time. So this reads the source once, keeping track of
 * whether it is inside a string or a comment, and only looks at calls it recognises by name.
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

/** How far a string or a comment runs from here, or `at` where this is neither. */
function skipDead(s: string, at: number): number {
  if (s.startsWith('--', at)) {
    const end = s.indexOf('\n', at);

    return end === -1 ? s.length : end;
  }
  const quote = s[at];
  if (quote !== '"' && quote !== "'") return at;
  let i = at + 1;
  while (i < s.length && s[i] !== quote) i += s[i] === '\\' ? 2 : 1;

  return Math.min(i + 1, s.length);
}

/** Whether a call by this name starts here, and is not the tail of a longer name. */
function matchesCall(s: string, at: number, name: string): boolean {
  if (!s.startsWith(name, at)) return false;
  const before = s[at - 1];
  if (before !== undefined && /[\w.]/.test(before)) return false;
  const after = s.slice(at + name.length);

  return /^\s*\(/.test(after);
}

/**
 * The arguments of a call whose opening bracket has just been passed.
 *
 * Split on the commas of this call only, so a nested call keeps its own. Returns nothing where the
 * bracket never closes, which is a source still being typed.
 */
function splitArgs(s: string, from: number): { parts: string[]; end: number } | null {
  const parts: string[] = [];
  let depth = 0;
  let start = from;
  let i = from;
  while (i < s.length) {
    const skipped = skipDead(s, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' && depth === 0) {
      parts.push(s.slice(start, i));

      return { parts, end: i };
    } else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }

  return null;
}
