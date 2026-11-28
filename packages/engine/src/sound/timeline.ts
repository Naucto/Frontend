import {
  BEATS_PER_BAR,
  defaultSong,
  type Instrument,
  type Note,
  type NoteSheet,
  type Pattern,
  type Song,
  type SongBlock,
  SUBSTEPS,
  VOICES,
} from './model';
import { PATTERN_BOUNDS } from './presets';

const EPSILON = 1e-6;

export const TICKS_PER_BEAT = SUBSTEPS * 8;

/** The first pattern number past every one taken. */
export const nextPatternSlot = (patterns: Iterable<Pick<Pattern, 'slot'>>): number =>
  Math.max(-1, ...Array.from(patterns, (pattern) => pattern.slot)) + 1;

export const patternBars = (sheet: NoteSheet): number =>
  sheet.steps / sheet.stepsPerBeat / BEATS_PER_BAR;

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

/**
 * A music that plays patterns one after the other on a single track, a pattern played twice in a
 * row being one block repeated. A pattern the library lacks is left out.
 */
export function songInSequence(
  order: readonly string[],
  patterns: ReadonlyMap<string, Pattern>,
  song: Partial<Song> = {},
): Song {
  const blocks: SongBlock[] = [];
  let start = 0;
  order.forEach((id, i) => {
    const pattern = patterns.get(id);
    if (!pattern) {
      return;
    }
    const last = blocks.at(-1);
    if (last?.pattern === id) {
      last.repeat += 1;
    } else {
      blocks.push({ id: `b${String(i)}`, pattern: id, start, repeat: 1, track: 0 });
    }
    start += patternBars(pattern);
  });
  return { ...defaultSong(patterns.get(order[0] ?? '')?.bpm), ...song, blocks, tracks: [''] };
}

const overlaps = (a: SongBlock, b: SongBlock, patterns: ReadonlyMap<string, Pattern>): boolean =>
  a.track === b.track &&
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

/**
 * Moves blocks by `delta` bars and `rows` tracks, kept together: none goes before the start or off
 * the last track, so the move stops where the first of them would.
 */
export function moveBlocks(
  song: Song,
  ids: ReadonlySet<string>,
  delta: number,
  patterns: ReadonlyMap<string, Pattern>,
  rows = 0,
): Song {
  const moving = song.blocks.filter((block) => ids.has(block.id));
  if (moving.length === 0) {
    return song;
  }
  const shift = Math.max(delta, -Math.min(...moving.map((block) => block.start)));
  const tracks = moving.map((block) => block.track);
  const down = Math.min(
    Math.max(rows, -Math.min(...tracks)),
    song.tracks.length - 1 - Math.max(...tracks),
  );
  if (shift === 0 && down === 0) {
    return song;
  }

  return placeBlocks(
    song,
    moving.map((block) => ({ ...block, start: block.start + shift, track: block.track + down })),
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
  const rows = new Set(chosen.map((block) => block.track));
  const shifted = song.blocks.map((block) =>
    !ids.has(block.id) && rows.has(block.track) && block.start >= last - EPSILON
      ? { ...block, start: block.start + span }
      : block,
  );

  return { song: { ...song, blocks: [...shifted, ...created] }, created };
}

export function stretchPattern(song: Song, patternId: string, addedBars: number): Song {
  if (addedBars <= 0) {
    return song;
  }
  const shifts = new Map<number, number>();
  const moved = new Map<string, number>();
  for (const block of [...song.blocks].sort((a, b) => a.start - b.start)) {
    const shift = shifts.get(block.track) ?? 0;
    moved.set(block.id, block.start + shift);
    if (block.pattern === patternId) {
      shifts.set(block.track, shift + addedBars * block.repeat);
    }
  }
  if (shifts.size === 0) {
    return song;
  }

  return {
    ...song,
    blocks: song.blocks.map((block) => ({ ...block, start: moved.get(block.id) ?? block.start })),
  };
}

/**
 * The most notes a sheet sounds at once, counting a note from its step to its end. Notes struck
 * together by an arpeggiating instrument walk one voice, so they count as one.
 */
export function notesAtOnce(
  sheet: NoteSheet,
  instruments: ReadonlyMap<string, Instrument>,
): number {
  const spans = new Map<string, { start: number; end: number }>();
  sheet.notes.forEach((note, i) => {
    if (note.step >= sheet.steps) {
      return;
    }
    const end = Math.min(sheet.steps, note.step + note.length);
    const arp = (instruments.get(note.instrument)?.arp.rate ?? 0) > 0;
    const key = arp ? `${note.instrument}@${String(note.step)}` : String(i);
    const held = spans.get(key);
    spans.set(key, { start: note.step, end: Math.max(end, held?.end ?? end) });
  });
  const edges = [...spans.values()]
    .flatMap((span) => [
      { at: span.start, by: 1 },
      { at: span.end, by: -1 },
    ])
    .sort((a, b) => a.at - b.at || a.by - b.by);
  let sounding = 0;
  let most = 0;
  for (const edge of edges) {
    sounding += edge.by;
    most = Math.max(most, sounding);
  }
  return most;
}

/** Which voices each track sounds on, which ones the sound effects keep, and which nobody does. */
interface VoicePlan {
  /** Per track, the voices it was given. */
  tracks: number[][];
  /** Per track, the voices its patterns ask for: at least one. */
  needs: number[];
  sfx: number[];
  /** Voices nobody needs, which the music and the sound effects may both take. */
  free: number[];
}

/**
 * Shares the five voices out: the sound effects' reserve first, then one voice to each track,
 * then, track after track, what each still needs while voices remain. A track given less than
 * it needs cuts a note when its patterns play more at once.
 */
export function voicePlan(
  song: Song,
  patterns: ReadonlyMap<string, Pattern>,
  instruments: ReadonlyMap<string, Instrument>,
): VoicePlan {
  const needs = song.tracks.map((_, track) =>
    Math.max(
      1,
      ...song.blocks.flatMap((block) => {
        const pattern = block.track === track ? patterns.get(block.pattern) : undefined;
        return pattern ? [notesAtOnce(pattern, instruments)] : [];
      }),
    ),
  );
  const reserve = Math.max(0, Math.min(VOICES - song.tracks.length, song.sfxVoices));
  let left = VOICES - reserve;
  const given = needs.map(() => 0);
  given.forEach((_, i) => {
    if (left > 0) {
      given[i] = 1;
      left -= 1;
    }
  });
  needs.forEach((need, i) => {
    const extra = Math.min(left, need - (given[i] ?? 0));
    given[i] = (given[i] ?? 0) + extra;
    left -= extra;
  });
  let next = 0;
  const tracks = given.map((count) => Array.from({ length: count }, () => next++));
  const free = Array.from({ length: left }, () => next++);
  const sfx = Array.from({ length: reserve }, () => next++);
  return { tracks, needs, sfx, free };
}

/** A new track at the bottom, while a voice is left for it beside the sound effects' reserve. */
export function addTrack(song: Song): Song {
  if (song.tracks.length + song.sfxVoices >= VOICES) {
    return song;
  }
  return { ...song, tracks: [...song.tracks, ''] };
}

/** Takes a track out with its blocks. The last track stays: a music always has one. */
export function removeTrack(song: Song, index: number): Song {
  if (song.tracks.length < 2 || index < 0 || index >= song.tracks.length) {
    return song;
  }
  return {
    ...song,
    tracks: song.tracks.filter((_, i) => i !== index),
    blocks: song.blocks
      .filter((block) => block.track !== index)
      .map((block) => (block.track > index ? { ...block, track: block.track - 1 } : block)),
  };
}

export const renameTrack = (song: Song, index: number, name: string): Song => ({
  ...song,
  tracks: song.tracks.map((track, i) => (i === index ? name : track)),
});

/** Keeps voices for the sound effects, leaving one at least to each track. */
export const setSfxVoices = (song: Song, count: number): Song => ({
  ...song,
  sfxVoices: Math.max(0, Math.min(VOICES - song.tracks.length, Math.round(count))),
});

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
