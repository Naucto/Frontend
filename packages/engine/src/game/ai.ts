import * as Y from 'yjs';

import { Game } from './Game';

export const AI_CATEGORIES = ['CODE', 'SPRITES', 'MAPS', 'MUSIC', 'SFX', 'MULTIPLAYER'] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];

/** Keys of the document the AI tooling owns next to the game itself. */
export const AI_KEYS = {
  catalog: 'ai.catalog',
  levels: 'ai.levels',
  locks: 'ai.locks',
  applied: 'ai.applied',
} as const;

export interface AiLock {
  id: string;
  name: string;
  target: 'sheet' | 'map';
  resourceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One palette index a hex digit: a 128×128 sheet is 16 KiB of text rather than ~40 KiB of JSON. */
const hexPixels = (pixels: Uint8Array): string => {
  let out = '';
  for (const value of pixels) out += (value & 15).toString(16);

  return out;
};

/**
 * A semantic snapshot for the assistant, including unsaved changes. It carries no credentials and
 * nothing in it is evaluated; the assistant is told to treat all of it as data.
 */
export function aiContext(game: Game): Record<string, unknown> {
  return {
    schemaVersion: game.schemaVersion,
    palette: game.palette,
    encoding: { sheetPixels: 'one hex digit per pixel, row-major' },
    code: game.files.map((file) => ({ id: file.id, name: file.name, text: file.text.toString() })),
    sheets: game.sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      width: sheet.width,
      height: sheet.height,
      base: sheet.base,
      pixels: hexPixels(sheet.pixels),
      flags: Array.from(sheet.flags),
    })),
    maps: game.maps.map((map) => ({
      id: map.id,
      name: map.name,
      width: map.width,
      height: map.height,
      tiles: Array.from(map.tiles),
    })),
    catalog: game.doc.getMap(AI_KEYS.catalog).toJSON(),
    levels: game.doc.getMap(AI_KEYS.levels).toJSON(),
    locks: game.doc.getMap(AI_KEYS.locks).toJSON(),
    instruments: game.instruments.toJSON(),
    patterns: game.patterns.toJSON(),
    songs: game.songs.toJSON(),
    sfx: game.sfx.toJSON(),
    samples: Object.keys(game.samples.toJSON()),
    // What each declared net.state path may be reached by, and what a session starts it at. The
    // live values are not here and cannot be: they belong to a running session, not the document.
    netPermissions: Object.fromEntries(game.netPermissions.entries()),
  };
}

/** A document's full state as the backend and the editor exchange it. */
export function encodeState(doc: Y.Doc): string {
  const update = Y.encodeStateAsUpdate(doc);
  let binary = '';
  for (let i = 0; i < update.length; i += 8192)
    binary += String.fromCharCode(...update.subarray(i, i + 8192));

  return btoa(binary);
}

/** A detached game built from a state; it is not connected to collaboration or autosave. */
export function gameFromState(state: string): Game {
  const doc = new Y.Doc();
  Y.applyUpdate(
    doc,
    Uint8Array.from(atob(state), (c) => c.charCodeAt(0)),
  );

  return new Game(doc);
}

export interface AiDiff {
  code: { id: string; name: string; before: string; after: string }[];
  sheets: { id: string; name: string; changed: number }[];
  maps: {
    id: string;
    name: string;
    changed: number;
    created: boolean;
    removed: boolean;
    resized: boolean;
  }[];
  sound: { key: string; before: string; after: string }[];
  catalog: { id: string; before: string; after: string }[];
  levels: { id: string; before: string; after: string }[];
  /**
   * Multiplayer declarations, in words rather than a raw JSON blob: a diff someone has to decode
   * is a diff that gets approved unread, and these decide who may read a game's own state.
   */
  net: { key: string; before: string; after: string; widened: boolean }[];
}

/** One declaration, written the way a person would say it. */
function describeNet(declaration: unknown): string {
  if (declaration === undefined || declaration === null)
    return 'not declared (open to every client)';
  const { flags, default: start } = declaration as { flags?: unknown; default?: unknown };
  if (typeof flags !== 'number') return 'malformed (treated as open)';
  const rights = [
    flags & 1 ? 'clients read' : 'clients cannot read',
    flags & 2 ? 'clients write' : 'clients cannot write',
  ].join(', ');
  return start === undefined ? rights : `${rights}, starts at ${JSON.stringify(start)}`;
}

function mapDiff(
  label: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { key: string; before: string; after: string }[] {
  const out: { key: string; before: string; after: string }[] = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[key] === undefined ? '' : JSON.stringify(before[key]);
    const now = after[key] === undefined ? '' : JSON.stringify(after[key]);
    if (was !== now) out.push({ key: `${label}:${key}`, before: was, after: now });
  }

  return out;
}

/**
 * Declaration changes, each flagged when it gives a client more than it had.
 *
 * `widened` matters more than the words: an undeclared path is open, so *removing* a declaration
 * and *clearing* a write bit both hand a client authority it did not have. A reviewer should not
 * have to derive that from two strings to know a change is the dangerous direction.
 */
function netDiff(before: Record<string, unknown>, after: Record<string, unknown>): AiDiff['net'] {
  const rightsOf = (declaration: unknown): number =>
    declaration && typeof (declaration as { flags?: unknown }).flags === 'number'
      ? (declaration as { flags: number }).flags & 3
      : 3;
  const out: AiDiff['net'] = [];
  for (const path of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[path];
    const now = after[path];
    if (JSON.stringify(was ?? null) === JSON.stringify(now ?? null)) continue;
    out.push({
      key: `net:${path}`,
      before: describeNet(was),
      after: describeNet(now),
      widened: rightsOf(now) > rightsOf(was),
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * What a proposal changes, read off the backend's own result rather than re-derived here: the
 * preview shows exactly what applying would write, from the one validator that decides it.
 */
export function diffGames(before: Game, after: Game): AiDiff {
  const files = new Map(before.files.map((file) => [file.id, file]));
  const code = after.files.flatMap((file) => {
    const was = files.get(file.id)?.text.toString() ?? '';
    const now = file.text.toString();

    return was === now ? [] : [{ id: file.id, name: file.name, before: was, after: now }];
  });
  for (const file of before.files)
    if (!after.files.some((f) => f.id === file.id))
      code.push({ id: file.id, name: file.name, before: file.text.toString(), after: '' });

  const sheets = after.sheets.flatMap((sheet) => {
    const was = before.sheets.find((s) => s.id === sheet.id);
    let changed = 0;
    for (let i = 0; i < sheet.pixels.length; i++)
      if ((was?.pixels[i] ?? 0) !== sheet.pixels[i]) changed++;

    return changed ? [{ id: sheet.id, name: sheet.name, changed }] : [];
  });

  const maps: AiDiff['maps'] = [];
  for (const map of after.maps) {
    const was = before.maps.find((m) => m.id === map.id);
    let changed = 0;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++)
        if ((was?.getTile(x, y) ?? 0) !== map.getTile(x, y)) changed++;
    const resized = !!was && (was.width !== map.width || was.height !== map.height);
    if (changed || !was || resized)
      maps.push({ id: map.id, name: map.name, changed, created: !was, removed: false, resized });
  }
  for (const map of before.maps)
    if (!after.maps.some((m) => m.id === map.id))
      maps.push({
        id: map.id,
        name: map.name,
        changed: 0,
        created: false,
        removed: true,
        resized: false,
      });

  const sound = [
    ...mapDiff('instrument', before.instruments.toJSON(), after.instruments.toJSON()),
    ...mapDiff('pattern', before.patterns.toJSON(), after.patterns.toJSON()),
    ...mapDiff('song', before.songs.toJSON(), after.songs.toJSON()),
    ...mapDiff('sfx', before.sfx.toJSON(), after.sfx.toJSON()),
    ...netDiff(before.netPermissions.toJSON(), after.netPermissions.toJSON()),
    ...mapDiff('sample', before.samples.toJSON(), after.samples.toJSON()).map((entry) => ({
      ...entry,
      before: entry.before ? `${String(Math.floor((entry.before.length * 3) / 4))} bytes` : '',
      after: entry.after ? `${String(Math.floor((entry.after.length * 3) / 4))} bytes` : '',
    })),
  ];
  const catalog = mapDiff(
    'catalog',
    before.doc.getMap(AI_KEYS.catalog).toJSON(),
    after.doc.getMap(AI_KEYS.catalog).toJSON(),
  ).map(({ key, ...rest }) => ({ id: key.slice('catalog:'.length), ...rest }));
  const levels = mapDiff(
    'level',
    before.doc.getMap(AI_KEYS.levels).toJSON(),
    after.doc.getMap(AI_KEYS.levels).toJSON(),
  ).map(({ key, ...rest }) => ({ id: key.slice('level:'.length), ...rest }));

  return {
    code,
    sheets,
    maps,
    sound,
    catalog,
    levels,
    net: netDiff(before.netPermissions.toJSON(), after.netPermissions.toJSON()),
  };
}

/** Locks are human configuration: the assistant reads them and the backend refuses writes inside. */
export function readLocks(game: Game): AiLock[] {
  const out: AiLock[] = [];
  game.doc.getMap<unknown>(AI_KEYS.locks).forEach((value, id) => {
    if (!value || typeof value !== 'object') return;
    const lock = value as Partial<AiLock>;
    if ((lock.target !== 'sheet' && lock.target !== 'map') || typeof lock.resourceId !== 'string')
      return;
    out.push({
      id,
      name: typeof lock.name === 'string' ? lock.name : id,
      target: lock.target,
      resourceId: lock.resourceId,
      x: Number(lock.x),
      y: Number(lock.y),
      width: Number(lock.width),
      height: Number(lock.height),
    });
  });

  return out;
}

/**
 * The runs of lines that differ between two texts, as line numbers in the new one.
 *
 * A change to a file is usually several separate edits, and a person reviewing one wants to be able
 * to take some of them. This is what the review screen offers as choices, and what the Backend
 * diffs again when asked to apply a range — it re-finds the hunks against the file as it is now,
 * so a hunk aimed by line number lands on the right edit even if the file moved in between.
 */
export function changedLineHunks(before: string, after: string): { from: number; to: number }[] {
  const a = before.split('\n');
  const b = after.split('\n');
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }
  if (a.length * b.length > 4_000_000) {
    // Too large to align: offer the one span rather than guessing at its parts.
    return b.length - tail > head ? [{ from: head, to: b.length - tail }] : [];
  }
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  // Flat rather than nested: one number per cell of a table this size, and a flat array is indexed
  // without the assertions a nested one would need at every step.
  const stride = midB.length + 1;
  const lcs = new Int32Array((midA.length + 1) * stride);
  const at = (i: number, j: number): number => lcs[i * stride + j] ?? 0;
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      lcs[i * stride + j] =
        midA[i] === midB[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const hunks: { from: number; to: number }[] = [];
  let open: { from: number; to: number } | null = null;
  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      if (open) {
        hunks.push(open);
        open = null;
      }
      i += 1;
      j += 1;
      continue;
    }
    open ??= { from: head + j, to: head + j };
    if (at(i + 1, j) >= at(i, j + 1)) i += 1;
    else j += 1;
    open.to = head + j;
  }
  if (open || i < midA.length || j < midB.length) {
    hunks.push(open ?? { from: head + j, to: head + midB.length });
  }
  return hunks;
}
