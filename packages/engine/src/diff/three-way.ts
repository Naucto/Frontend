import type { EditableGame } from '../game/EditableGame';
import { remapSprites } from '../game/renumber';
import { openState } from '../game/state';
import { soundEntries, soundNeeds } from '../sound/uses';
import {
  type ChangeItem,
  computeChanges,
  type DiffEditor,
  type MapAreaChange,
  type SoundChange,
} from './changes';
import { lineDiff, lineHunks } from './lines';
import { applyChange, inStages } from './merge';

/** Which side a conflict is settled with: the draft being carried over, or the latest save. */
export type MergeSide = 'draft' | 'latest';

/** A part both sides changed from the base, each in its own way. */
export interface MergeConflict {
  /** What a resolution names. */
  key: string;
  editor: DiffEditor;
  reason: 'both-changed' | 'removed-in-draft' | 'removed-in-latest' | 'still-used' | 'name-taken';
}

export interface ThreeWayMerge {
  /** The merged state, or null while a conflict is left unsettled. */
  state: string | null;
  conflicts: MergeConflict[];
}

// ---- code ---------------------------------------------------------------------

/** Lines `start` to `end` of the base, `end` left out, becoming `lines`. */
interface Edit {
  start: number;
  end: number;
  lines: string[];
}

function editsOf(base: string, side: string): Edit[] {
  const rows = lineDiff(base, side);
  let at = 0;
  const starts = rows.map((row) => {
    const start = at;
    at += row.left ? 1 : 0;
    return start;
  });
  return lineHunks(rows).map((hunk) => {
    const held = rows.slice(hunk.start, hunk.end);
    const start = starts[hunk.start] ?? at;
    return {
      start,
      end: start + held.filter((row) => row.left).length,
      lines: held.flatMap((row) => (row.right ? [row.right.text] : [])),
    };
  });
}

/** Two edits that cannot both be made: they share a line, or add at the same place. */
const clash = (a: Edit, b: Edit): boolean =>
  (a.start < b.end && b.start < a.end) || a.start === b.start;

const sameEdit = (a: Edit, b: Edit): boolean =>
  a.start === b.start && a.end === b.end && a.lines.join('\n') === b.lines.join('\n');

/**
 * Two texts grown from one base, merged line by line. Where both changed the same lines in their
 * own way, `prefer` says which is kept, and `conflict` that it happened.
 */
export function mergeTexts(
  base: string,
  draft: string,
  latest: string,
  prefer: MergeSide = 'draft',
): { text: string; conflict: boolean } {
  const mine = editsOf(base, draft);
  const theirs = editsOf(base, latest);
  let conflict = false;
  for (const edit of mine) {
    conflict ||= theirs.some((other) => clash(edit, other) && !sameEdit(edit, other));
  }
  // One side is kept whole, and of the other what it does not touch.
  const [kept, other] = prefer === 'draft' ? [mine, theirs] : [theirs, mine];
  const edits = [...kept, ...other.filter((edit) => !kept.some((each) => clash(edit, each)))].sort(
    (a, b) => a.start - b.start || a.end - b.end,
  );
  const lines = base.split('\n');
  const out: string[] = [];
  let at = 0;
  for (const edit of edits) {
    out.push(...lines.slice(at, edit.start), ...edit.lines);
    at = edit.end;
  }
  out.push(...lines.slice(at));
  return { text: out.join('\n'), conflict };
}

// ---- the rest -----------------------------------------------------------------

/** Thrown where sprites were renumbered on one side: what the other says by number is lost. */
export class SpritesRenumberedError extends Error {
  constructor() {
    super(
      'Sheets were resized or removed, which renumbered sprites the other side names by number: ' +
        'these two cannot be merged',
    );
    this.name = 'SpritesRenumberedError';
  }
}

const textOf = (game: EditableGame, id: string): string =>
  game.files.find((file) => file.id === id)?.text.toString() ?? '';

/** What a change makes of its part, compared to tell the same edit made twice from two edits. */
function resultOf(item: ChangeItem, game: EditableGame): string {
  switch (item.type) {
    case 'code-file':
      return JSON.stringify([item.kind === 'DELETED', item.name, item.after]);
    case 'sheet':
    case 'map': {
      const held = (item.type === 'sheet' ? game.sheets : game.maps).find(
        (each) => each.id === item.id,
      );
      return JSON.stringify(
        held && [
          held.name,
          held.width,
          held.height,
          Array.from('pixels' in held ? held.pixels : held.tiles),
          'flags' in held ? Array.from(held.flags) : [],
        ],
      );
    }
    case 'sheet-cell':
      return Array.from(item.after).join();
    case 'code-hunk':
    case 'map-area':
      return '';
    default:
      return JSON.stringify(item.after);
  }
}

/** Changes of whole parts: one whose removal takes every change inside it along. */
const isWhole = (item: ChangeItem): boolean =>
  item.type === 'code-file' || item.type === 'sheet' || item.type === 'map';

interface Draft {
  items: ChangeItem[];
  byKey: Map<string, ChangeItem>;
}
const read = (from: EditableGame, to: EditableGame): Draft => {
  const items = computeChanges(from, to);
  return { items, byKey: new Map(items.map((item) => [item.key, item])) };
};

/** The tiles an area changes, by cell. */
const cellsOf = (items: readonly ChangeItem[], mapId: string): Map<string, number> => {
  const out = new Map<string, number>();
  for (const item of items) {
    if (item.type !== 'map-area' || item.mapId !== mapId) {
      continue;
    }
    for (let i = 0; i < item.cells.length; i += 4) {
      out.set(`${String(item.cells[i])},${String(item.cells[i + 1])}`, item.cells[i + 3] ?? 0);
    }
  }
  return out;
};

/**
 * What a draft changed since `base`, carried onto the latest save of the same game: the changes a
 * review lists, made of the same parts, so what merges by itself and what does not is told in the
 * same terms. Where both sides changed one part differently a resolution says which is kept, and
 * nothing is merged while one is missing.
 *
 * The texts a game is described by are not part of it: they are kept as the latest save has them.
 */
export function mergeThreeWay(
  states: { base: string; draft: string; latest: string },
  resolutions: Readonly<Record<string, MergeSide>> = {},
): ThreeWayMerge {
  const opened = [states.base, states.draft, states.latest].map(openState);
  const result = openState(states.latest);
  try {
    const [base, draft, latest] = opened.map((each) => each.game) as [
      EditableGame,
      EditableGame,
      EditableGame,
    ];
    const mine = read(base, draft);
    const theirs = read(base, latest);
    const moved = (game: EditableGame): boolean => remapSprites(base.sheets, game.sheets).size > 0;
    if (mine.items.length && theirs.items.length && (moved(draft) || moved(latest))) {
      throw new SpritesRenumberedError();
    }
    if (!theirs.items.length && moved(draft)) {
      return { state: states.draft, conflicts: [] };
    }

    const conflicts: MergeConflict[] = [];
    const take: ChangeItem[] = [];
    /** Answers which side is kept, and records the conflict while nobody said. */
    const settle = (
      key: string,
      editor: DiffEditor,
      reason: MergeConflict['reason'],
    ): MergeSide | null => {
      conflicts.push({ key, editor, reason });
      return resolutions[key] ?? null;
    };
    const theirWhole = new Map(
      theirs.items.filter(isWhole).map((item) => [item.container, item] as const),
    );
    const theirContainers = new Set(theirs.items.map((item) => item.container));
    const settledContainers = new Map<string, MergeSide | null>();
    /** The text each merged file ends with. */
    const texts = new Map<string, string>();
    const files = new Set<string>();
    const maps = new Set<string>();

    for (const item of mine.items) {
      const { container, editor } = item;
      const whole = theirWhole.get(container);
      if (isWhole(item) || whole) {
        // One side added or removed the whole part.
        const mineWhole = isWhole(item);
        if (!theirContainers.has(container)) {
          take.push(item);
          continue;
        }
        if (
          mineWhole &&
          whole?.kind === item.kind &&
          resultOf(item, draft) === resultOf(whole, latest)
        ) {
          continue;
        }
        if (!settledContainers.has(container)) {
          const reason =
            mineWhole && item.kind === 'DELETED'
              ? 'removed-in-draft'
              : whole?.kind === 'DELETED'
                ? 'removed-in-latest'
                : 'both-changed';
          settledContainers.set(container, settle(container, editor, reason));
          if (settledContainers.get(container) === 'draft') {
            if (mineWhole && item.kind === 'DELETED') {
              take.push(item);
            } else {
              take.push(...wholeFrom(draft, result.game, container));
              if (item.type === 'code-file') {
                texts.set(item.fileId, textOf(draft, item.fileId));
              }
            }
          }
        }
        continue;
      }
      if (item.type === 'code-hunk') {
        files.add(item.fileId);
        continue;
      }
      if (item.type === 'map-area') {
        maps.add(item.mapId);
        continue;
      }
      const other = theirs.byKey.get(item.key);
      if (!other) {
        take.push(item);
      } else if (resultOf(item, draft) !== resultOf(other, latest)) {
        const reason =
          item.kind === 'DELETED'
            ? 'removed-in-draft'
            : other.kind === 'DELETED'
              ? 'removed-in-latest'
              : 'both-changed';
        if (settle(item.key, editor, reason) === 'draft') {
          take.push(item);
        }
      }
    }

    for (const id of maps) {
      const ours = cellsOf(mine.items, id);
      const others = cellsOf(theirs.items, id);
      const both = [...ours].filter(([at, tile]) => {
        const held = others.get(at);
        return held !== undefined && held !== tile;
      });
      const side = both.length ? settle(`map:${id}`, 'map', 'both-changed') : 'draft';
      const left = new Set(side === 'draft' ? [] : both.map(([at]) => at));
      for (const item of mine.items) {
        if (item.type === 'map-area' && item.mapId === id) {
          take.push(withoutCells(item, left));
        }
      }
    }

    for (const id of files) {
      const parts = [textOf(base, id), textOf(draft, id), textOf(latest, id)] as const;
      const merged = mergeTexts(...parts);
      const side = merged.conflict ? settle(`code:${id}`, 'code', 'both-changed') : 'draft';
      texts.set(id, side === 'latest' ? mergeTexts(...parts, 'latest').text : merged.text);
    }

    soundReferences(mine, theirs, draft, latest, take, settle);
    actionNames(draft, latest, take, settle);

    const unsettled = conflicts.filter((conflict) => resolutions[conflict.key] === undefined);
    if (unsettled.length) {
      return { state: null, conflicts: unsettled };
    }
    // Not in one transaction: a sheet added inside one is not there yet to be drawn on.
    for (const item of [...take].sort(inStages)) {
      applyChange(result.game, draft, item);
    }
    for (const [id, text] of texts) {
      result.game.setFileText(id, text);
    }
    return { state: result.save(), conflicts: [] };
  } finally {
    result.close();
    for (const each of opened) {
      each.close();
    }
  }
}

/** The changes that make a whole part what the draft has, in place of what is there. */
function wholeFrom(draft: EditableGame, current: EditableGame, container: string): ChangeItem[] {
  return computeChanges(current, draft).filter((item) => item.container === container);
}

function withoutCells(item: MapAreaChange, left: ReadonlySet<string>): MapAreaChange {
  const cells: number[] = [];
  for (let i = 0; i < item.cells.length; i += 4) {
    if (!left.has(`${String(item.cells[i])},${String(item.cells[i + 1])}`)) {
      cells.push(...item.cells.subarray(i, i + 4));
    }
  }
  return { ...item, cells: Int32Array.from(cells) };
}

type Settle = (
  key: string,
  editor: DiffEditor,
  reason: MergeConflict['reason'],
) => MergeSide | null;

/** A sound one side removed while the other came to play it. */
function soundReferences(
  mine: Draft,
  theirs: Draft,
  draft: EditableGame,
  latest: EditableGame,
  take: ChangeItem[],
  settle: Settle,
): void {
  const isSound = (item: ChangeItem): item is SoundChange => item.type === 'sound';
  const needs = (items: readonly ChangeItem[]): Set<string> =>
    new Set(
      items
        .filter(isSound)
        .flatMap((item) => (item.after === null ? [] : soundNeeds(item.part, item.after))),
    );
  const wanted = needs(take);
  const entries = soundEntries(draft);
  for (const item of theirs.items.filter(isSound)) {
    const name = `${item.part}:${item.id}`;
    const held = entries[item.part].get(item.id);
    if (
      item.after !== null ||
      !wanted.has(name) ||
      held === undefined ||
      mine.byKey.has(item.key)
    ) {
      continue;
    }
    if (settle(item.key, 'sound', 'removed-in-latest') === 'draft') {
      take.push({ ...item, kind: 'NEW', before: null, after: held });
    }
  }
  const used = needs(theirs.items);
  for (const item of take.filter(isSound)) {
    const name = `${item.part}:${item.id}`;
    const there = soundEntries(latest)[item.part].has(item.id);
    if (item.after !== null || !used.has(name) || !there) {
      continue;
    }
    if (settle(item.key, 'sound', 'still-used') !== 'draft') {
      take.splice(take.indexOf(item), 1);
    }
  }
}

/** Two controls given one name, one on each side. */
function actionNames(
  draft: EditableGame,
  latest: EditableGame,
  take: ChangeItem[],
  settle: Settle,
): void {
  const gone = new Set(
    take.flatMap((item) => (item.type === 'action' && item.after === null ? [item.id] : [])),
  );
  for (const item of [...take]) {
    if (item.type !== 'action' || item.after === null) {
      continue;
    }
    const { name, id } = item.after;
    const holder = latest.actions.find(
      (action) => action.name === name && action.id !== id && !gone.has(action.id),
    );
    if (
      !holder ||
      draft.actions.some((action) => action.id === holder.id && action.name !== name)
    ) {
      continue;
    }
    if (settle(item.key, 'game', 'name-taken') === 'draft') {
      take.push({
        key: `game:action:${holder.id}`,
        editor: 'game',
        kind: 'DELETED',
        container: `game:action:${holder.id}`,
        type: 'action',
        id: holder.id,
        before: holder,
        after: null,
      });
    } else {
      take.splice(take.indexOf(item), 1);
    }
  }
}
