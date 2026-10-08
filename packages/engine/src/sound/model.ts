export type OscType = 'square' | 'sine' | 'triangle' | 'saw' | 'noise' | 'sample';
export type FilterType = 'off' | 'lp' | 'hp' | 'bp';

export interface Envelope {
  /** seconds */
  attack: number;
  decay: number;
  /** 0..1 */
  sustain: number;
  release: number;
}

export interface Instrument {
  id: string;
  name: string;
  osc: OscType;
  /** Square duty cycle 0..1 (0.5 = square). */
  duty: number;
  /** Constant pitch offset in semitones, -12..12. */
  detune: number;
  /** Portamento in seconds: how long the pitch takes to reach a new note. 0 = off. */
  glide: number;
  sampleId?: string;
  /** MIDI note at which the sample plays at its recorded pitch. */
  sampleRoot?: number;
  env: Envelope;
  vibrato: { rate: number; depth: number; delay: number };
  /**
   * Speed, in cycles a second, at which the voice walks the chord written on the same step; zero
   * holds every note at once.
   */
  arp: { rate: number };
  filter: { type: FilterType; cutoff: number; resonance: number; envAmount: number };
  /** 0..1 */
  volume: number;
  /** -1..1 */
  pan: number;
  /** 0..15, which accent colour the editor shows it with. */
  colour: number;
}

export interface Note {
  /** Step index inside the pattern. */
  step: number;
  /** MIDI pitch 0..127 */
  pitch: number;
  /** Length in steps (may be fractional). */
  length: number;
  instrument: string;
  /** 0..1 */
  volume: number;
}

export interface Pattern {
  id: string;
  /** The pattern's display number, shown in a song's order list in place of the id. */
  slot: number;
  name: string;
  bpm: number;
  stepsPerBeat: 1 | 2 | 4 | 8;
  steps: number;
  notes: Note[];
}

export interface Song {
  name: string;
  /** Pattern ids played in order; `null` is an empty place, where the music ends. */
  sequence: (string | null)[];
  loop: boolean;
  loopStart: number;
}

/**
 * Positions a step is divided into for playback, and so the finest position a note's fractional
 * `step` may take.
 */
export const SUBSTEPS = 8;

export const VOICES = 5;
export const MAX_SAMPLE_BYTES = 8 * 1024;

export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

/** Middle C, as a MIDI note number. */
export const C4 = 60;

export const midiToFrequency = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** "C4" → 60, "A#3" → 58. Returns null for unparsable names. */
export const noteNameToMidi = (name: string): number | null => {
  const match = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!match) {
    return null;
  }
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[(match[1] ?? 'c').toLowerCase()] ?? 0;
  const acc = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + base + acc;
};

export const midiToNoteName = (midi: number): string =>
  `${NOTE_NAMES[((midi % 12) + 12) % 12] ?? 'C'}${String(Math.floor(midi / 12) - 1)}`;

export const defaultInstrument = (id: string, name = 'lead'): Instrument => ({
  id,
  name,
  osc: 'square',
  duty: 0.5,
  detune: 0,
  glide: 0,
  env: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.15 },
  vibrato: { rate: 5, depth: 0, delay: 0.2 },
  arp: { rate: 0 },
  filter: { type: 'off', cutoff: 8000, resonance: 0.2, envAmount: 0 },
  volume: 0.8,
  pan: 0,
  colour: 4,
});

export const defaultPattern = (id: string, slot = 0, name = 'pattern 00'): Pattern => ({
  id,
  slot,
  name,
  bpm: 124,
  stepsPerBeat: 4,
  steps: 32,
  notes: [],
});

export const defaultSong = (): Song => ({
  name: '',
  sequence: [],
  loop: true,
  loopStart: 0,
});
