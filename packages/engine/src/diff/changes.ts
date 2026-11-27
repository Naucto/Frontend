import type { EditableGame } from '../game/EditableGame';
import type { NetRule } from '../game/Game';
import { SPRITE_SIZE } from '../game/keys';
import { type DiffRow, lineDiff, type LineHunk, lineHunks } from './lines';

/** The editor a change is reviewed in. */
export type DiffEditor = 'code' | 'art' | 'map' | 'sound' | 'net';

/** What a change does to the thing it targets. */
export type DiffKind = 'NEW' | 'EDIT' | 'DELETED';

/** The rail's order, which is also the order prev / next walks the changes in. */
export const DIFF_EDITORS: readonly DiffEditor[] = ['code', 'art', 'map', 'sound', 'net'];

/** A rectangle on a grid of cells, inclusive of `x` and `y` and exclusive of `x + w`, `y + h`. */
export interface CellBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

/** The sound library parts that are reviewed one entry at a time. */
export type SoundPart = 'instruments' | 'patterns' | 'songs' | 'sfx' | 'samples';

interface ChangeBase {
  /** Stable for as long as the two snapshots are the same, e.g. `code:main#h3`. */
  key: string;
  editor: DiffEditor;
  kind: DiffKind;
  /** The file, sheet, map, sound entry or net path the change belongs to, for "whole file". */
  container: string;
  /**
   * What deciding this change decides with it. Read from references in the snapshots (a pattern
   * naming an instrument, a cell inside a grown sheet), never from whoever wrote the change.
   */
  deps?: { onAccept: string[]; onReject: string[] };
}

export interface CodeFileChange extends ChangeBase {
  type: 'code-file';
  fileId: string;
  name: string;
  /** The whole text on each side; the absent side is the empty string. */
  before: string;
  after: string;
}

export interface CodeNameChange extends ChangeBase {
  type: 'code-name';
  fileId: string;
  before: string;
  after: string;
}

export interface CodeHunkChange extends ChangeBase {
  type: 'code-hunk';
  fileId: string;
  /** Index of the hunk among the file's hunks, which is what the merge takes. */
  index: number;
  hunk: LineHunk;
}

export interface GridEntryChange extends ChangeBase {
  type: 'sheet' | 'map';
  id: string;
  name: string;
}

export interface GridSizeChange extends ChangeBase {
  type: 'sheet-size' | 'map-size';
  id: string;
  before: Size;
  after: Size;
}

export interface SheetCellChange extends ChangeBase {
  type: 'sheet-cell';
  sheetId: string;
  /** The cell's column and row on the sheet, in sprites. */
  col: number;
  row: number;
  /** The sprite number the cell has on the side that has it, the new side first. */
  sprite: number;
  before: Uint8Array;
  after: Uint8Array;
}

export interface SheetFlagsChange extends ChangeBase {
  type: 'sheet-flags';
  sheetId: string;
  col: number;
  row: number;
  sprite: number;
  before: number;
  after: number;
}

export interface PaletteChange extends ChangeBase {
  type: 'palette';
  index: number;
  before: string;
  after: string;
}

export interface MapAreaChange extends ChangeBase {
  type: 'map-area';
  mapId: string;
  bounds: CellBounds;
  /** Every changed tile of the area: x, y, before, after, flat. */
  cells: Int32Array;
}

export interface NetChange extends ChangeBase {
  type: 'net';
  path: string;
  before: NetRule | null;
  after: NetRule | null;
}

export interface SoundChange extends ChangeBase {
  type: 'sound';
  part: SoundPart;
  id: string;
  name: string;
  /** The stored entry on each side, decoded, or null where it is absent. */
  before: unknown;
  after: unknown;
}

export type ChangeItem =
  | CodeFileChange
  | CodeNameChange
  | CodeHunkChange
  | GridEntryChange
  | GridSizeChange
  | SheetCellChange
  | SheetFlagsChange
  | PaletteChange
  | MapAreaChange
  | NetChange
  | SoundChange;

const kindOf = (had: boolean, has: boolean): DiffKind => {
  if (!had) {
    return 'NEW';
  }
  return has ? 'EDIT' : 'DELETED';
};

// ---- code -------------------------------------------------------------------

/** A file's rows and hunks, worked out once and shared by the change list and the merge. */
export interface FileDiff {
  fileId: string;
  rows: DiffRow[];
  hunks: LineHunk[];
}

export function fileDiffs(before: EditableGame, after: EditableGame): Map<string, FileDiff> {
  const out = new Map<string, FileDiff>();
  const old = new Map(before.files.map((file) => [file.id, file.text.toString()]));
  for (const file of after.files) {
    const was = old.get(file.id);
    const now = file.text.toString();
    if (was === undefined || was === now) {
      continue;
    }
    const rows = lineDiff(was, now);
    out.set(file.id, { fileId: file.id, rows, hunks: lineHunks(rows) });
  }
  return out;
}

function codeChanges(
  before: EditableGame,
  after: EditableGame,
  diffs: Map<string, FileDiff>,
): ChangeItem[] {
  const out: ChangeItem[] = [];
  const old = new Map(before.files.map((file) => [file.id, file]));
  const now = new Map(after.files.map((file) => [file.id, file]));
  const ids = [...new Set([...now.keys(), ...old.keys()])];
  for (const fileId of ids) {
    const was = old.get(fileId);
    const is = now.get(fileId);
    const container = `code:${fileId}`;
    if (!was || !is) {
      out.push({
        key: container,
        editor: 'code',
        kind: kindOf(!!was, !!is),
        container,
        type: 'code-file',
        fileId,
        name: (is ?? was)?.name ?? fileId,
        before: was?.text.toString() ?? '',
        after: is?.text.toString() ?? '',
      });
      continue;
    }
    if (was.name !== is.name) {
      out.push({
        key: `${container}#name`,
        editor: 'code',
        kind: 'EDIT',
        container,
        type: 'code-name',
        fileId,
        before: was.name,
        after: is.name,
      });
    }
    diffs.get(fileId)?.hunks.forEach((hunk, index) => {
      const rows = diffs.get(fileId)?.rows.slice(hunk.start, hunk.end) ?? [];
      const kind: DiffKind = rows.every((row) => row.kind === 'added')
        ? 'NEW'
        : rows.every((row) => row.kind === 'removed')
          ? 'DELETED'
          : 'EDIT';
      out.push({
        key: `${container}#h${String(index)}`,
        editor: 'code',
        kind,
        container,
        type: 'code-hunk',
        fileId,
        index,
        hunk,
      });
    });
  }
  return out;
}

// ---- grids ------------------------------------------------------------------

/**
 * The connected parts of a set of changed cells, eight neighbours apart at most, so a stroke drawn
 * on a diagonal is one area and two separate edits are two.
 */
export function connectedAreas(changed: Uint8Array, width: number, height: number): number[][] {
  const seen = new Uint8Array(changed.length);
  const areas: number[][] = [];
  for (let start = 0; start < changed.length; start += 1) {
    if (!changed[start] || seen[start]) {
      continue;
    }
    const area: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const at = stack.pop() ?? 0;
      area.push(at);
      const x = at % width;
      const y = Math.floor(at / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }
          const next = ny * width + nx;
          if (changed[next] && !seen[next]) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    areas.push(area.sort((a, b) => a - b));
  }
  return areas;
}

/**
 * A grown grid ties the cells of its new part to its size: such a cell cannot be kept without the
 * room it stands in, and refusing the room refuses the cell.
 */
function tieToSize(
  cells: ChangeItem[],
  size: GridSizeChange,
  inNewPart: (c: ChangeItem) => boolean,
): void {
  const tied = cells.filter(inNewPart).map((cell) => cell.key);
  if (!tied.length) {
    return;
  }
  size.deps = { onAccept: [], onReject: tied };
  for (const cell of cells) {
    if (tied.includes(cell.key)) {
      cell.deps = { onAccept: [size.key], onReject: [] };
    }
  }
}

function mapChanges(before: EditableGame, after: EditableGame): ChangeItem[] {
  const out: ChangeItem[] = [];
  const old = new Map(before.maps.map((map) => [map.id, map]));
  const now = new Map(after.maps.map((map) => [map.id, map]));
  for (const id of new Set([...now.keys(), ...old.keys()])) {
    const was = old.get(id);
    const is = now.get(id);
    const container = `map:${id}`;
    if (!was || !is) {
      out.push({
        key: container,
        editor: 'map',
        kind: kindOf(!!was, !!is),
        container,
        type: 'map',
        id,
        name: (is ?? was)?.name ?? id,
      });
      continue;
    }
    let size: GridSizeChange | null = null;
    if (was.width !== is.width || was.height !== is.height) {
      size = {
        key: `${container}#size`,
        editor: 'map',
        kind: 'EDIT',
        container,
        type: 'map-size',
        id,
        before: { width: was.width, height: was.height },
        after: { width: is.width, height: is.height },
      };
      out.push(size);
    }
    // Cells beyond the new size are what a shrink takes away; the size change says so on its own.
    const { width, height } = is;
    const changed = new Uint8Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        changed[y * width + x] = was.getTile(x, y) !== is.getTile(x, y) ? 1 : 0;
      }
    }
    const areas: MapAreaChange[] = connectedAreas(changed, width, height).map((area, index) => {
      const cells = new Int32Array(area.length * 4);
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let added = true;
      let removed = true;
      area.forEach((at, i) => {
        const x = at % width;
        const y = Math.floor(at / width);
        const from = was.getTile(x, y);
        const to = is.getTile(x, y);
        cells.set([x, y, from, to], i * 4);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        added &&= from === 0;
        removed &&= to === 0;
      });
      return {
        key: `${container}#a${String(index)}`,
        editor: 'map',
        kind: added ? 'NEW' : removed ? 'DELETED' : 'EDIT',
        container,
        type: 'map-area',
        mapId: id,
        bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        cells,
      };
    });
    if (size) {
      const grown = size;
      tieToSize(areas, grown, (cell) => {
        const { bounds } = cell as MapAreaChange;
        return (
          bounds.x + bounds.w > grown.before.width || bounds.y + bounds.h > grown.before.height
        );
      });
    }
    out.push(...areas);
  }
  return out;
}

function sheetChanges(before: EditableGame, after: EditableGame): ChangeItem[] {
  const out: ChangeItem[] = [];
  const old = new Map(before.sheets.map((sheet) => [sheet.id, sheet]));
  const now = new Map(after.sheets.map((sheet) => [sheet.id, sheet]));
  for (const id of new Set([...now.keys(), ...old.keys()])) {
    const was = old.get(id);
    const is = now.get(id);
    const container = `art:${id}`;
    if (!was || !is) {
      out.push({
        key: container,
        editor: 'art',
        kind: kindOf(!!was, !!is),
        container,
        type: 'sheet',
        id,
        name: (is ?? was)?.name ?? id,
      });
      continue;
    }
    let size: GridSizeChange | null = null;
    if (was.width !== is.width || was.height !== is.height) {
      size = {
        key: `${container}#size`,
        editor: 'art',
        kind: 'EDIT',
        container,
        type: 'sheet-size',
        id,
        before: { width: was.width, height: was.height },
        after: { width: is.width, height: is.height },
      };
      out.push(size);
    }
    const cells: ChangeItem[] = [];
    for (let row = 0; row < is.rows; row += 1) {
      for (let col = 0; col < is.cols; col += 1) {
        const from = new Uint8Array(SPRITE_SIZE * SPRITE_SIZE);
        const to = new Uint8Array(SPRITE_SIZE * SPRITE_SIZE);
        let differs = false;
        let wasEmpty = true;
        let isEmpty = true;
        for (let y = 0; y < SPRITE_SIZE; y += 1) {
          for (let x = 0; x < SPRITE_SIZE; x += 1) {
            const px = col * SPRITE_SIZE + x;
            const py = row * SPRITE_SIZE + y;
            const a = was.getPixel(px, py);
            const b = is.getPixel(px, py);
            from[y * SPRITE_SIZE + x] = a;
            to[y * SPRITE_SIZE + x] = b;
            differs ||= a !== b;
            wasEmpty &&= a === 0;
            isEmpty &&= b === 0;
          }
        }
        const sprite = is.base + row * is.cols + col;
        const cellKey = `${container}#c${String(col)},${String(row)}`;
        if (differs) {
          cells.push({
            key: cellKey,
            editor: 'art',
            kind: wasEmpty ? 'NEW' : isEmpty ? 'DELETED' : 'EDIT',
            container,
            type: 'sheet-cell',
            sheetId: id,
            col,
            row,
            sprite,
            before: from,
            after: to,
          });
        }
        const inOld = col < was.cols && row < was.rows;
        const oldFlag = inOld ? was.getFlag(was.base + row * was.cols + col) : 0;
        const newFlag = is.getFlag(sprite);
        if (oldFlag !== newFlag) {
          cells.push({
            key: `${cellKey}#f`,
            editor: 'art',
            kind: 'EDIT',
            container,
            type: 'sheet-flags',
            sheetId: id,
            col,
            row,
            sprite,
            before: oldFlag,
            after: newFlag,
          });
        }
      }
    }
    if (size) {
      const grown = size;
      tieToSize(cells, grown, (cell) => {
        const { col, row } = cell as SheetCellChange;
        return (
          (col + 1) * SPRITE_SIZE > grown.before.width ||
          (row + 1) * SPRITE_SIZE > grown.before.height
        );
      });
    }
    out.push(...cells);
  }
  const oldPalette = before.palette;
  after.palette.forEach((hex, index) => {
    const was = oldPalette[index] ?? '';
    if (was.toLowerCase() !== hex.toLowerCase()) {
      out.push({
        key: `palette#${String(index)}`,
        editor: 'art',
        kind: 'EDIT',
        container: 'palette',
        type: 'palette',
        index,
        before: was,
        after: hex,
      });
    }
  });
  return out;
}

// ---- net ----------------------------------------------------------------------

function netChanges(before: EditableGame, after: EditableGame): ChangeItem[] {
  const rules = (game: EditableGame): Map<string, NetRule> => {
    const out = new Map<string, NetRule>();
    game.netPermissions.forEach((rule, path) => {
      out.set(path, rule);
    });
    return out;
  };
  const old = rules(before);
  const now = rules(after);
  const out: ChangeItem[] = [];
  for (const path of [...new Set([...old.keys(), ...now.keys()])].sort()) {
    const was = old.get(path) ?? null;
    const is = now.get(path) ?? null;
    if (was?.flags === is?.flags && !!was === !!is) {
      continue;
    }
    out.push({
      key: `net:${path}`,
      editor: 'net',
      kind: kindOf(!!was, !!is),
      container: `net:${path.split('.')[0] ?? path}`,
      type: 'net',
      path,
      before: was,
      after: is,
    });
  }
  return out;
}

// ---- sound --------------------------------------------------------------------

const nameOf = (entry: unknown, fallback: string): string => {
  const name = (entry as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name ? name : fallback;
};

/** The instruments a pattern or a sound effect plays. */
const instrumentsOf = (entry: unknown): string[] => {
  const notes = (entry as { notes?: { instrument?: unknown }[] } | null)?.notes ?? [];
  return [...new Set(notes.map((note) => note.instrument).filter((id) => typeof id === 'string'))];
};

/** The patterns a song lays out. */
const patternsOf = (entry: unknown): string[] => {
  const blocks = (entry as { blocks?: { pattern?: unknown }[] } | null)?.blocks ?? [];
  return [...new Set(blocks.map((block) => block.pattern).filter((id) => typeof id === 'string'))];
};

function soundChanges(before: EditableGame, after: EditableGame): ChangeItem[] {
  const sides: Record<SoundPart, (game: EditableGame) => Map<string, unknown>> = {
    instruments: (game) => game.getInstruments(),
    patterns: (game) => game.getPatterns(),
    songs: (game) => game.getSongs(),
    sfx: (game) => game.getSfx(),
    samples: (game) => game.getSamples(),
  };
  const out: SoundChange[] = [];
  for (const part of Object.keys(sides) as SoundPart[]) {
    const old = sides[part](before);
    const now = sides[part](after);
    for (const id of new Set([...now.keys(), ...old.keys()])) {
      const was = old.get(id) ?? null;
      const is = now.get(id) ?? null;
      if (JSON.stringify(was) === JSON.stringify(is)) {
        continue;
      }
      out.push({
        key: `sound:${part}:${id}`,
        editor: 'sound',
        kind: kindOf(was !== null, is !== null),
        container: `sound:${part}:${id}`,
        type: 'sound',
        part,
        id,
        name: nameOf(is ?? was, id),
        before: was,
        after: is,
      });
    }
  }
  // Something that plays a new entry needs it: keeping the user keeps the entry, and refusing the
  // entry refuses every user of it.
  const fresh = new Map(
    out
      .filter((change) => change.kind === 'NEW')
      .map((change) => [`${change.part}:${change.id}`, change]),
  );
  const tie = (user: SoundChange, needed: string): void => {
    const dep = fresh.get(needed);
    if (!dep || dep === user) {
      return;
    }
    user.deps ??= { onAccept: [], onReject: [] };
    user.deps.onAccept.push(dep.key);
    dep.deps ??= { onAccept: [], onReject: [] };
    dep.deps.onReject.push(user.key);
  };
  for (const change of out) {
    if (change.after === null) {
      continue;
    }
    if (change.part === 'patterns' || change.part === 'sfx') {
      for (const id of instrumentsOf(change.after)) {
        tie(change, `instruments:${id}`);
      }
    } else if (change.part === 'songs') {
      for (const id of patternsOf(change.after)) {
        tie(change, `patterns:${id}`);
      }
    } else if (change.part === 'instruments') {
      const sample = (change.after as { sampleId?: unknown }).sampleId;
      if (typeof sample === 'string') {
        tie(change, `samples:${sample}`);
      }
    }
  }
  return out;
}

/** Everything that differs between two snapshots, in rail order. */
export function computeChanges(before: EditableGame, after: EditableGame): ChangeItem[] {
  return [
    ...codeChanges(before, after, fileDiffs(before, after)),
    ...sheetChanges(before, after),
    ...mapChanges(before, after),
    ...soundChanges(before, after),
    ...netChanges(before, after),
  ];
}
