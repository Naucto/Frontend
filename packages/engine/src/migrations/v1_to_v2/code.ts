import type * as Y from 'yjs';

import { matchesName, skipDead, splitArgs } from '../../game/luaScan';
import { type DeclaredAction, isAction } from '../../input/ActionMap';
import { applySplices, type Splice } from '../splice';
import type { MigrationReport, MigrationWarning } from '../types';
import { V1_RENAMES } from './renames';

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
const SCREEN_COL = 'gfx.screen_col';

/** Nothing but whitespace, to the end of the text tested. */
const BLANK = /^\s*$/;
/** The whitespace a text starts with, possibly none. */
const LEADING_SPACE = /^\s*/;
/** Whitespace, then an opening parenthesis: the name before it is called. */
const CALLED = /^\s*\(/;
/**
 * The end of a line's text before a name, when that name sits where a value goes: after `=`, a
 * comma, an opening bracket, or `return`.
 */
const VALUE_POSITION = /[=,({[]\s*$|\breturn\s*$/;
/**
 * One field of a table constructor, from where `lastIndex` points: a bare name or a quoted
 * `["key"]` (groups 1, or 2 and 3), `=`, a quoted label (groups 4 and 5), then a separator or the
 * end. Each quote is closed by the same character that opened it.
 */
const LABEL_FIELD =
  /\s*(?:([A-Za-z_]\w*)|\[\s*(["'])((?:\\.|(?!\2).)*)\2\s*\])\s*=\s*(["'])((?:\\.|(?!\4).)*)\4\s*(?:[,;]|$)/y;
/** A backslash before a quote or a backslash, the escapes a Lua string literal has for them. */
const ESCAPED_QUOTE = /\\(["'\\])/g;

export interface CodeRewrite {
  splices: Splice[];
  /** Labels found in literal `input.declare` calls, in the order the file gives them. */
  declared: DeclaredAction[];
}

const lineOf = (source: string, at: number): number => source.slice(0, at).split('\n').length;

/** Where the bracket opening here closes, past nested ones and dead text, or null if it never does. */
function closeOf(source: string, open: number): number | null {
  let depth = 0;
  let i = open;
  while (i < source.length) {
    const skipped = skipDead(source, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    const char = source[i];
    if (char === '(' || char === '[' || char === '{') {
      depth += 1;
    } else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
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
  const labels: DeclaredAction[] = [];
  let at = 0;
  while (at < inner.length) {
    if (BLANK.test(inner.slice(at))) {
      break;
    }
    LABEL_FIELD.lastIndex = at;
    const match = LABEL_FIELD.exec(inner);
    if (!match) {
      return null;
    }
    at = LABEL_FIELD.lastIndex;
    const key = (match[1] ?? match[3] ?? '').replace(ESCAPED_QUOTE, '$1');
    const label = (match[5] ?? '').replace(ESCAPED_QUOTE, '$1').trim();
    if (!isAction(key)) {
      warn(`${DECLARE}: "${key}" is not an action; dropped`);
      continue;
    }
    if (label === '') {
      continue;
    }
    labels.push({ action: key, label });
  }

  return labels;
}

/** The splices that bring every name of {@link V1_RENAMES} in a source to its current one. */
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
    for (const [from, to] of V1_RENAMES) {
      if (!matchesName(source, i, from)) {
        continue;
      }
      splices.push({ start: i, end: i + from.length, text: to });
      width = from.length;
      break;
    }
    i += width;
  }

  return splices;
}

/** One file's scan: what it reads, and what it has found so far. */
interface Scan {
  source: string;
  splices: Splice[];
  declared: DeclaredAction[];
  warn: (at: number, message: string) => void;
}

/** Handles one family of names at `at`, where `name` starts; returns where the scan resumes. */
type Matcher = (scan: Scan, at: number, name: string) => number;

const renameAt: Matcher = (scan, at, name) => {
  const renamed = V1_RENAMES.get(name) ?? name;
  scan.splices.push({ start: at, end: at + name.length, text: renamed });
  return at + name.length;
};

const goneAt: Matcher = (scan, at, name) => {
  scan.warn(at, `${name} no longer exists; draw the effect from _scanline(y) instead`);
  return at + name.length;
};

const screenColAt: Matcher = (scan, at, name) => {
  const { source } = scan;
  const nameEnd = at + name.length;
  const open = source.indexOf('(', nameEnd);
  const args = CALLED.test(source.slice(nameEnd)) ? splitArgs(source, open + 1) : null;
  if (args?.parts.length === 3) {
    scan.warn(at, `${name} takes no row any more; call it from _scanline(y) for one row`);
  }
  return nameEnd;
};

/**
 * Lifts the labels of a literal `input.declare` statement into the document and removes the
 * statement, with its line when it stands alone; any other use is left with a warning.
 */
const declareAt: Matcher = (scan, at, name) => {
  const { source, warn } = scan;
  const nameEnd = at + name.length;
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  const before = source.slice(lineStart, at);
  if (VALUE_POSITION.test(before)) {
    warn(at, `${DECLARE} is used as a value; left in place, set the labels in the GAME tab`);
    return nameEnd;
  }
  const argAt = nameEnd + (LEADING_SPACE.exec(source.slice(nameEnd))?.[0].length ?? 0);
  const bracket = source[argAt];
  const close = bracket === '(' || bracket === '{' ? closeOf(source, argAt) : null;
  if (close === null) {
    warn(at, `${DECLARE} has no closing bracket; left in place, set the labels in the GAME tab`);
    return nameEnd;
  }
  let table = source.slice(argAt, close + 1).trim();
  if (bracket === '(') {
    table = table.slice(1, -1).trim();
  }
  const labels =
    table.startsWith('{') && table.endsWith('}')
      ? parseLabels(table.slice(1, -1), (message) => {
          warn(at, message);
        })
      : null;
  if (labels === null) {
    warn(
      at,
      `${DECLARE} is not given a table of strings; left in place, set the labels in the GAME tab`,
    );
    return nameEnd;
  }
  scan.declared.push(...labels);
  const lineEnd = source.indexOf('\n', close + 1);
  const after = source.slice(close + 1, lineEnd === -1 ? source.length : lineEnd);
  const alone = BLANK.test(before) && BLANK.test(after);
  scan.splices.push({
    start: alone ? lineStart : at,
    end: alone ? (lineEnd === -1 ? source.length : lineEnd + 1) : close + 1,
    text: '',
  });
  return close + 1;
};

/** Every name the v2 scan stops on, each with the matcher of its family, in the order tried. */
const MATCHERS: ReadonlyMap<string, Matcher> = new Map<string, Matcher>([
  ...[...V1_RENAMES.keys()].map((name) => [name, renameAt] as const),
  ...GONE.map((name) => [name, goneAt] as const),
  [SCREEN_COL, screenColAt],
  [DECLARE, declareAt],
]);
const NAMES: readonly string[] = [...MATCHERS.keys()];

/**
 * The splices that bring a file to the v2 names, and the labels its literal `input.declare`
 * statements gave; any other use is left with a warning.
 */
export function computeV2Splices(
  source: string,
  report: MigrationReport,
  file: string,
): CodeRewrite {
  const scan: Scan = {
    source,
    splices: [],
    declared: [],
    warn: (at, message) => {
      const warning: MigrationWarning = { step: 'code', file, line: lineOf(source, at), message };
      report.warnings.push(warning);
    },
  };
  let i = 0;
  while (i < source.length) {
    const skipped = skipDead(source, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    const name = NAMES.find((candidate) => matchesName(source, i, candidate));
    const matcher = name === undefined ? undefined : MATCHERS.get(name);
    if (name === undefined || !matcher) {
      i += 1;
      continue;
    }
    i = matcher(scan, i, name);
  }

  return { splices: scan.splices, declared: scan.declared };
}

export function migrateCode(text: Y.Text, report: MigrationReport, file: string): DeclaredAction[] {
  const { splices, declared } = computeV2Splices(text.toString(), report, file);
  report.counts[`rewrites:${file}`] = applySplices(text, splices);

  return declared;
}
