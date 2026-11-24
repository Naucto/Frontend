import type { Note, Pattern, Sfx, Song, SongBlock } from './model';

type StoredNote =
  | [step: number, pitch: number, length: number, instrument: string]
  | [step: number, pitch: number, length: number, instrument: string, volume: number];

type StoredBlock =
  | [id: string, pattern: string, start: number]
  | [id: string, pattern: string, start: number, repeat: number];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const encodeNote = (note: Note): StoredNote =>
  note.volume === 1
    ? [note.step, note.pitch, note.length, note.instrument]
    : [note.step, note.pitch, note.length, note.instrument, note.volume];

function decodeNote(raw: unknown): Note | null {
  if (Array.isArray(raw)) {
    const [step, pitch, length, instrument, volume] = raw as unknown[];
    return {
      step: num(step, 0),
      pitch: num(pitch, 60),
      length: num(length, 1),
      instrument: str(instrument),
      volume: num(volume, 1),
    };
  }
  if (isRecord(raw)) {
    return {
      step: num(raw.step, 0),
      pitch: num(raw.pitch, 60),
      length: num(raw.length, 1),
      instrument: str(raw.instrument),
      volume: num(raw.volume, 1),
    };
  }
  return null;
}

const decodeNotes = (raw: unknown): Note[] =>
  Array.isArray(raw) ? raw.flatMap((each) => decodeNote(each) ?? []) : [];

const encodeBlock = (block: SongBlock): StoredBlock =>
  block.repeat === 1
    ? [block.id, block.pattern, block.start]
    : [block.id, block.pattern, block.start, block.repeat];

function decodeBlock(raw: unknown): SongBlock | null {
  if (Array.isArray(raw)) {
    const [id, pattern, start, repeat] = raw as unknown[];
    return { id: str(id), pattern: str(pattern), start: num(start, 0), repeat: num(repeat, 1) };
  }
  if (isRecord(raw)) {
    return {
      id: str(raw.id),
      pattern: str(raw.pattern),
      start: num(raw.start, 0),
      repeat: num(raw.repeat, 1),
    };
  }
  return null;
}

const stepsPerBeat = (value: unknown): Pattern['stepsPerBeat'] =>
  value === 1 || value === 2 || value === 8 ? value : 4;

export const encodePattern = (pattern: Pattern): string =>
  JSON.stringify({ ...pattern, notes: pattern.notes.map(encodeNote) });

export function decodePattern(raw: unknown): Pattern | null {
  if (!isRecord(raw)) {
    return null;
  }
  const pattern: Pattern = {
    id: str(raw.id),
    slot: num(raw.slot, 0),
    name: str(raw.name),
    bpm: num(raw.bpm, 124),
    stepsPerBeat: stepsPerBeat(raw.stepsPerBeat),
    steps: num(raw.steps, 16),
    notes: decodeNotes(raw.notes),
  };
  if (typeof raw.colour === 'number') {
    pattern.colour = raw.colour;
  }
  return pattern;
}

export const encodeSfx = (sfx: Sfx): string =>
  JSON.stringify({ ...sfx, notes: sfx.notes.map(encodeNote) });

export function decodeSfx(raw: unknown): Sfx | null {
  if (!isRecord(raw)) {
    return null;
  }
  return {
    name: str(raw.name),
    bpm: num(raw.bpm, 240),
    stepsPerBeat: stepsPerBeat(raw.stepsPerBeat),
    steps: num(raw.steps, 16),
    notes: decodeNotes(raw.notes),
  };
}

export const encodeSong = (song: Song): string =>
  JSON.stringify({ ...song, blocks: song.blocks.map(encodeBlock) });

export function decodeSong(raw: unknown): Song | null {
  if (!isRecord(raw) || !Array.isArray(raw.blocks)) {
    return null;
  }
  const song: Song = {
    name: str(raw.name),
    bpm: num(raw.bpm, 124),
    blocks: raw.blocks.flatMap((each) => decodeBlock(each) ?? []),
    loop: raw.loop !== false,
    loopStart: num(raw.loopStart, 0),
  };
  if (typeof raw.loopEnd === 'number') {
    song.loopEnd = raw.loopEnd;
  }
  return song;
}

const BLOCK_ID_LENGTH = 4;
const BLOCK_ID_SPACE = 36 ** BLOCK_ID_LENGTH;

export function blockIds(song: Song, random: () => number = Math.random): () => string {
  const taken = new Set(song.blocks.map((block) => block.id));
  return () => {
    let id: string;
    do {
      id = Math.floor(random() * BLOCK_ID_SPACE)
        .toString(36)
        .padStart(BLOCK_ID_LENGTH, '0');
    } while (taken.has(id));
    taken.add(id);
    return id;
  };
}
