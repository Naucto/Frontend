import type * as Y from 'yjs';

import { EditableGame } from '../../game/EditableGame';
import { KEYS, LEGACY_KEYS } from '../../game/keys';
import { matchesCall, skipDead, splitArgs } from '../../game/luaScan';
import type { Pattern, Sfx, Song, SongBlock } from '../../sound/model';
import { decodePattern, encodePattern, encodeSfx, encodeSong } from '../../sound/storage';
import { patternBars } from '../../sound/timeline';
import type { MigrationReport } from '../types';
import type { V3Song } from './legacy';

const DEFAULT_BPM = 124;
const MUSIC_POS = 'sound.music_pos';
const SET_PATTERN = 'sound.set_pattern';
const BPM_FIELD = /\bbpm\b/;

const parse = (raw: string | undefined): unknown => {
  if (raw === undefined) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const isV3Song = (value: unknown): value is V3Song =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { sequence?: unknown }).sequence);

function readPatterns(doc: Y.Doc): Map<string, Pattern> {
  const out = new Map<string, Pattern>();
  const stored = doc.getMap<string>(KEYS.patterns);
  stored.forEach((raw, id) => {
    const pattern = decodePattern(parse(raw));
    if (pattern) {
      out.set(id, pattern);
    }
  });
  for (const [id, pattern] of out) {
    stored.set(id, encodePattern(pattern));
  }

  return out;
}

function toSong(
  slot: string,
  old: V3Song,
  patterns: ReadonlyMap<string, Pattern>,
  report: MigrationReport,
): Song {
  const blocks: SongBlock[] = [];
  const starts: number[] = [];
  const tempos = new Set<number>();
  let cursor = 0;
  let holes = 0;
  old.sequence.forEach((entry, i) => {
    starts.push(cursor);
    if (entry === null) {
      cursor += 1;
      holes += 1;
      return;
    }
    const pattern = patterns.get(entry);
    if (!pattern) {
      return;
    }
    blocks.push({ id: `b${String(i)}`, pattern: entry, start: cursor, repeat: 1, track: 0 });
    tempos.add(pattern.bpm);
    cursor += patternBars(pattern);
  });
  const first = blocks[0] ? patterns.get(blocks[0].pattern) : undefined;
  const bpm = first?.bpm ?? DEFAULT_BPM;
  if (tempos.size > 1) {
    report.warnings.push({
      step: 'sound',
      message: `music ${slot}: its patterns had different tempos (${[...tempos].join(', ')} bpm); the whole music now plays at ${String(bpm)} bpm`,
    });
  }
  const lastFilled = old.sequence.reduce<number>(
    (last, entry, i) => (entry === null ? last : i),
    -1,
  );
  if (holes > 0 && old.sequence.slice(0, lastFilled).includes(null)) {
    report.warnings.push({
      step: 'sound',
      message: `music ${slot}: an empty place used to end the music; it is now one bar of silence and what follows it plays`,
    });
  }
  const loopAt = Math.min(Math.max(0, old.loopStart), Math.max(0, old.sequence.length - 1));

  return {
    name: old.name,
    bpm,
    blocks,
    tracks: [''],
    sfxVoices: 0,
    loop: old.loop,
    loopStart: starts[loopAt] ?? 0,
  };
}

function migrateSongs(
  doc: Y.Doc,
  patterns: ReadonlyMap<string, Pattern>,
  report: MigrationReport,
): void {
  const songs = doc.getMap<string>(KEYS.songs);
  let count = 0;
  for (const [slot, raw] of [...songs.entries()]) {
    const old = parse(raw);
    if (!isV3Song(old)) {
      continue;
    }
    songs.set(slot, encodeSong(toSong(slot, old, patterns, report)));
    count += 1;
  }
  report.counts.songs = count;
}

function migrateSfx(
  doc: Y.Doc,
  patterns: ReadonlyMap<string, Pattern>,
  report: MigrationReport,
): void {
  const slots = doc.getMap<string>(LEGACY_KEYS.sfxSlots);
  const effects = doc.getMap<string>(KEYS.sfx);
  let count = 0;
  for (const [slot, patternId] of [...slots.entries()]) {
    const pattern = patterns.get(patternId);
    if (pattern) {
      const sfx: Sfx = {
        name: pattern.name,
        bpm: pattern.bpm,
        stepsPerBeat: pattern.stepsPerBeat,
        steps: pattern.steps,
        notes: pattern.notes.map((note) => ({ ...note })),
      };
      effects.set(slot, encodeSfx(sfx));
      count += 1;
    }
    slots.delete(slot);
  }
  report.counts.sfx = count;
}

const lineOf = (source: string, at: number): number => source.slice(0, at).split('\n').length;

function soundCallWarnings(source: string, file: string, report: MigrationReport): void {
  let i = 0;
  while (i < source.length) {
    const skipped = skipDead(source, i);
    if (skipped > i) {
      i = skipped;
      continue;
    }
    if (matchesCall(source, i, MUSIC_POS)) {
      report.warnings.push({
        step: 'code',
        file,
        line: lineOf(source, i),
        message: `${MUSIC_POS} now returns the bar and the beat, not the place in the chain and the step`,
      });
      i += MUSIC_POS.length;
      continue;
    }
    if (matchesCall(source, i, SET_PATTERN)) {
      const open = source.indexOf('(', i + SET_PATTERN.length);
      const args = splitArgs(source, open + 1);
      if (args && BPM_FIELD.test(args.parts.slice(1).join(','))) {
        report.warnings.push({
          step: 'code',
          file,
          line: lineOf(source, i),
          message: `${SET_PATTERN} no longer sets bpm: a music has one tempo, set it with sound.set_music`,
        });
      }
      i += SET_PATTERN.length;
      continue;
    }
    i += 1;
  }
}

export function migrateV3ToV4(doc: Y.Doc, report: MigrationReport): void {
  const patterns = readPatterns(doc);
  migrateSongs(doc, patterns, report);
  migrateSfx(doc, patterns, report);
  const game = new EditableGame(doc);
  for (const file of game.files) {
    soundCallWarnings(file.text.toString(), file.name, report);
  }
  game.destroy();
}
