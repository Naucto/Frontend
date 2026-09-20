import type * as Y from 'yjs';

import { matchesName, skipDead, splitArgs } from '../../game/luaScan';
import { type DeclaredAction, isAction } from '../../input/ActionMap';
import { applySplices, type Splice } from '../splice';
import type { MigrationReport, MigrationWarning } from '../types';

/**
 * Names the API no longer answers to, and what each is called now.
 *
 * The step below rewrites them as it crosses a v1 document, and `migrateGame` rewrites them again
 * on every document it opens, whatever its version: a rename changes no shape, so it earns no
 * schema of its own, and only a pass that always runs reaches a game already at the current one.
 */
export const RENAMES: ReadonlyMap<string, string> = new Map([
  ['input.btn', 'input.held'],
  ['input.btnp', 'input.pressed'],
  ['input.btnr', 'input.released'],
  ['sound.music_position', 'sound.music_pos'],
]);

/** Row effects the virtual beam replaced: a game calling one has to be rewritten by hand. */
const GONE: readonly string[] = [
  'gfx.scanline',
  'gfx.scanline_range',
  'gfx.scanline_fn',
  'gfx.reset_scanlines',
  'gfx.persist_effects',
  'gfx.set_palette_row',
];

const DECLARE = 'input.declare';

const NAMES: readonly string[] = [...RENAMES.keys(), ...GONE, 'gfx.screen_col', DECLARE];

export interface CodeRewrite {
  splices: Splice[];
  /** Labels found in literal `input.declare` calls, in the order the file gives them. */
  declared: DeclaredAction[];
}

const lineOf = (s: string, at: number): number => s.slice(0, at).split('\n').length;

/** Where the bracket opening here closes, past nested ones and dead text, or null if it never does. */
function closeOf(s: string, open: number): number | null {
  let depth = 0;
  let i = open;
  while (i < s.length) {
    const skipped = skipDead(s, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    const c = s[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }

  return null;
}

/**
 * The action labels of a table constructor's inside, or null where it is anything but a flat
 * table of string keys and string values.
 *
 * A computed label is only known while the game runs, so it is left for the author to move.
 */
function parseLabels(inner: string, warn: (message: string) => void): DeclaredAction[] | null {
  const field =
    /\s*(?:([A-Za-z_]\w*)|\[\s*(["'])((?:\\.|(?!\2).)*)\2\s*\])\s*=\s*(["'])((?:\\.|(?!\4).)*)\4\s*(?:[,;]|$)/y;
  const labels: DeclaredAction[] = [];
  let at = 0;
  while (at < inner.length) {
    if (/^\s*$/.test(inner.slice(at))) break;
    field.lastIndex = at;
    const m = field.exec(inner);
    if (!m) return null;
    at = field.lastIndex;
    const key = (m[1] ?? m[3] ?? '').replace(/\\(["'\\])/g, '$1');
    const label = (m[5] ?? '').replace(/\\(["'\\])/g, '$1').trim();
    if (!isAction(key)) {
      warn(`${DECLARE}: "${key}" is not an action; dropped`);
      continue;
    }
    if (label === '') continue;
    labels.push({ action: key, label });
  }

  return labels;
}

/** The splices that bring every name of {@link RENAMES} in a source to its current one. */
export function computeRenames(source: string): Splice[] {
  const splices: Splice[] = [];
  let i = 0;
  while (i < source.length) {
    const skipped = skipDead(source, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    let width = 1;
    for (const [from, to] of RENAMES) {
      if (!matchesName(source, i, from)) continue;
      splices.push({ start: i, end: i + from.length, text: to });
      width = from.length;
      break;
    }
    i += width;
  }

  return splices;
}

/**
 * The splices that bring a file to the v2 names, and the labels its `input.declare` gave.
 *
 * `input.btn` becomes `input.held` wherever it is written, not only where it is called: a game may
 * keep a reference to it, and the old name answers nothing any more. A literal `input.declare`
 * statement is cut out whole, with its line when it stood alone on one; any other use of it is
 * left where it is, with a warning, since it would leave a hole in an expression.
 */
export function computeV2Splices(
  source: string,
  report: MigrationReport,
  file: string,
): CodeRewrite {
  const splices: Splice[] = [];
  const declared: DeclaredAction[] = [];
  const warn = (at: number, message: string): void => {
    const w: MigrationWarning = { step: 'code', file, line: lineOf(source, at), message };
    report.warnings.push(w);
  };
  let i = 0;
  while (i < source.length) {
    const skipped = skipDead(source, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    const name = NAMES.find((n) => matchesName(source, i, n));
    if (!name) {
      i += 1;
      continue;
    }
    const nameEnd = i + name.length;
    const renamed = RENAMES.get(name);
    if (renamed !== undefined) {
      splices.push({ start: i, end: nameEnd, text: renamed });
      i = nameEnd;
      continue;
    }
    if (GONE.includes(name)) {
      warn(i, `${name} no longer exists; draw the effect from _scanline(y) instead`);
      i = nameEnd;
      continue;
    }
    if (name === 'gfx.screen_col') {
      const open = source.indexOf('(', nameEnd);
      const args = /^\s*\(/.test(source.slice(nameEnd)) ? splitArgs(source, open + 1) : null;
      if (args?.parts.length === 3)
        warn(i, `${name} takes no row any more; call it from _scanline(y) for one row`);
      i = nameEnd;
      continue;
    }

    const lineStart = source.lastIndexOf('\n', i - 1) + 1;
    const before = source.slice(lineStart, i);
    if (/[=,({[]\s*$|\breturn\s*$/.test(before)) {
      warn(i, `${DECLARE} is used as a value; left in place, set the labels in the GAME tab`);
      i = nameEnd;
      continue;
    }
    const argAt = nameEnd + (/^\s*/.exec(source.slice(nameEnd))?.[0].length ?? 0);
    const bracket = source[argAt];
    const close = bracket === '(' || bracket === '{' ? closeOf(source, argAt) : null;
    if (close === null) {
      warn(i, `${DECLARE} has no closing bracket; left in place, set the labels in the GAME tab`);
      i = nameEnd;
      continue;
    }
    let table = source.slice(argAt, close + 1).trim();
    if (bracket === '(') table = table.slice(1, -1).trim();
    const labels =
      table.startsWith('{') && table.endsWith('}')
        ? parseLabels(table.slice(1, -1), (m) => {
            warn(i, m);
          })
        : null;
    if (labels === null) {
      warn(
        i,
        `${DECLARE} is not given a table of strings; left in place, set the labels in the GAME tab`,
      );
      i = nameEnd;
      continue;
    }
    declared.push(...labels);
    const lineEnd = source.indexOf('\n', close + 1);
    const after = source.slice(close + 1, lineEnd === -1 ? source.length : lineEnd);
    const alone = /^\s*$/.test(before) && /^\s*$/.test(after);
    splices.push({
      start: alone ? lineStart : i,
      end: alone ? (lineEnd === -1 ? source.length : lineEnd + 1) : close + 1,
      text: '',
    });
    i = close + 1;
  }

  return { splices, declared };
}

export function migrateCode(text: Y.Text, report: MigrationReport, file: string): DeclaredAction[] {
  const { splices, declared } = computeV2Splices(text.toString(), report, file);
  report.counts[`rewrites:${file}`] = applySplices(text, splices);

  return declared;
}
