import {
  BEATS_PER_BAR,
  type Note,
  type NoteSheet,
  type Pattern,
  type Song,
  type SongBlock,
  SUBSTEPS,
} from './model';
import { PATTERN_BOUNDS } from './presets';

const EPSILON = 1e-6;

export const TICKS_PER_BEAT = SUBSTEPS * 8;

export const sheetBeats = (sheet: NoteSheet): number => sheet.steps / sheet.stepsPerBeat;

export const patternBars = (sheet: NoteSheet): number => sheetBeats(sheet) / BEATS_PER_BAR;

export const blockBars = (block: SongBlock, patterns: ReadonlyMap<string, Pattern>): number => {
  const pattern = patterns.get(block.pattern);

  return pattern ? patternBars(pattern) * block.repeat : 0;
};

export const songEnd = (song: Song, patterns: ReadonlyMap<string, Pattern>): number =>
  song.blocks.reduce((end, block) => Math.max(end, block.start + blockBars(block, patterns)), 0);

export const songLoopEnd = (song: Song, patterns: ReadonlyMap<string, Pattern>): number => {
  const end = songEnd(song, patterns);

  return song.loopEnd === undefined ? end : Math.min(song.loopEnd, end);
};

const overlaps = (a: SongBlock, b: SongBlock, patterns: ReadonlyMap<string, Pattern>): boolean =>
  a.start < b.start + blockBars(b, patterns) - EPSILON &&
  a.start + blockBars(a, patterns) > b.start + EPSILON;

export function placeBlocks(
  song: Song,
  placed: readonly SongBlock[],
  patterns: ReadonlyMap<string, Pattern>,
): Song {
  const ids = new Set(placed.map((block) => block.id));
  const kept = song.blocks.filter(
    (block) => !ids.has(block.id) && !placed.some((other) => overlaps(block, other, patterns)),
  );

  return {
    ...song,
    blocks: [...kept, ...placed.map((block) => ({ ...block, start: Math.max(0, block.start) }))],
  };
}

export function moveBlocks(
  song: Song,
  ids: ReadonlySet<string>,
  delta: number,
  patterns: ReadonlyMap<string, Pattern>,
): Song {
  const moving = song.blocks.filter((block) => ids.has(block.id));
  if (moving.length === 0) {
    return song;
  }
  const shift = Math.max(delta, -Math.min(...moving.map((block) => block.start)));
  if (shift === 0) {
    return song;
  }

  return placeBlocks(
    song,
    moving.map((block) => ({ ...block, start: block.start + shift })),
    patterns,
  );
}

export function setBlockRepeat(
  song: Song,
  id: string,
  repeat: number,
  patterns: ReadonlyMap<string, Pattern>,
): Song {
  const block = song.blocks.find((each) => each.id === id);
  if (!block) {
    return song;
  }

  return placeBlocks(song, [{ ...block, repeat: Math.max(1, Math.round(repeat)) }], patterns);
}

export const removeBlocks = (song: Song, ids: ReadonlySet<string>): Song => ({
  ...song,
  blocks: song.blocks.filter((block) => !ids.has(block.id)),
});

export function duplicateBlocks(
  song: Song,
  ids: ReadonlySet<string>,
  patterns: ReadonlyMap<string, Pattern>,
  newId: () => string,
): { song: Song; created: SongBlock[] } {
  const chosen = song.blocks.filter((block) => ids.has(block.id));
  if (chosen.length === 0) {
    return { song, created: [] };
  }
  const first = Math.min(...chosen.map((block) => block.start));
  const last = Math.max(...chosen.map((block) => block.start + blockBars(block, patterns)));
  const span = last - first;
  const created = chosen.map((block) => ({ ...block, id: newId(), start: block.start + span }));
  const shifted = song.blocks.map((block) =>
    !ids.has(block.id) && block.start >= last - EPSILON
      ? { ...block, start: block.start + span }
      : block,
  );

  return { song: { ...song, blocks: [...shifted, ...created] }, created };
}

export function stretchPattern(song: Song, patternId: string, addedBars: number): Song {
  if (addedBars <= 0) {
    return song;
  }
  let shift = 0;
  const moved = new Map<string, number>();
  for (const block of [...song.blocks].sort((a, b) => a.start - b.start)) {
    moved.set(block.id, block.start + shift);
    if (block.pattern === patternId) {
      shift += addedBars * block.repeat;
    }
  }
  if (shift === 0) {
    return song;
  }

  return {
    ...song,
    blocks: song.blocks.map((block) => ({ ...block, start: moved.get(block.id) ?? block.start })),
  };
}

export const withoutPattern = (song: Song, patternId: string): Song => ({
  ...song,
  blocks: song.blocks.filter((block) => block.pattern !== patternId),
});

export const patternUses = (song: Song, patternId: string): number =>
  song.blocks.filter((block) => block.pattern === patternId).length;

export const MAX_SHEET_STEPS = PATTERN_BOUNDS.steps.max;

export function fittedSteps(stepsPerBeat: number, notes: readonly Note[]): number {
  const bar = stepsPerBeat * BEATS_PER_BAR;
  const end = notes.reduce((last, note) => Math.max(last, note.step + note.length), 0);

  return Math.min(MAX_SHEET_STEPS, Math.max(bar, Math.ceil(end / bar) * bar));
}

export function stepsAfterEdit(sheet: NoteSheet, notes: readonly Note[]): number {
  const fitted = fittedSteps(sheet.stepsPerBeat, notes);

  return sheet.steps === fittedSteps(sheet.stepsPerBeat, sheet.notes)
    ? fitted
    : Math.max(sheet.steps, fitted);
}
