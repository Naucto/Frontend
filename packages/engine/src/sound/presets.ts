import type { Envelope, Instrument } from './model';

export interface Bound {
  readonly min: number;
  readonly max: number;
}

/**
 * Range each setting of an instrument is edited in — where the inspector's sliders run to.
 *
 * A preset is pinned inside it because a value past the end of a slider is one the author can
 * hear, and see, but never get back to by hand once it has been nudged. The filter's envelope
 * amount has no slider and is not here: nothing sets it but a migration.
 */
export const INSTRUMENT_BOUNDS = {
  duty: { min: 0.05, max: 0.95 },
  detune: { min: -12, max: 12 },
  glide: { min: 0, max: 0.5 },
  sampleRoot: { min: 24, max: 95 },
  env: {
    attack: { min: 0, max: 3 },
    decay: { min: 0, max: 3 },
    sustain: { min: 0, max: 1 },
    release: { min: 0, max: 3 },
  },
  vibrato: {
    rate: { min: 1, max: 20 },
    depth: { min: 0, max: 1 },
    delay: { min: 0, max: 1 },
  },
  arp: { rate: { min: 0, max: 30 } },
  filter: {
    cutoff: { min: 100, max: 12000 },
    resonance: { min: 0, max: 1 },
  },
  volume: { min: 0, max: 1 },
  pan: { min: -1, max: 1 },
} as const satisfies {
  duty: Bound;
  detune: Bound;
  glide: Bound;
  sampleRoot: Bound;
  env: Record<keyof Envelope, Bound>;
  vibrato: Record<keyof Instrument['vibrato'], Bound>;
  arp: Record<keyof Instrument['arp'], Bound>;
  filter: Record<'cutoff' | 'resonance', Bound>;
  volume: Bound;
  pan: Bound;
};

/** Everything that makes an instrument sound — not what it is called or shown as. */
export type InstrumentPreset = Omit<Instrument, 'id' | 'name' | 'colour'>;

/** The shelf a preset sits on when they are browsed: what kind of part it plays in a piece. */
export type PresetFamily = 'lead' | 'bass' | 'keys' | 'pad' | 'drums' | 'fx';

export const PRESET_FAMILIES: readonly PresetFamily[] = [
  'lead',
  'bass',
  'keys',
  'pad',
  'drums',
  'fx',
];

export interface InstrumentPresetEntry {
  readonly name: string;
  readonly family: PresetFamily;
  /** What it is for, in one line. */
  readonly blurb: string;
  /** The MIDI note it is auditioned at: a kick at middle C is not a kick. */
  readonly note: number;
  readonly settings: InstrumentPreset;
}

const NO_VIBRATO = { rate: 5, depth: 0, delay: 0.2 };
const NO_FILTER = { type: 'off', cutoff: 8000, resonance: 0.2, envAmount: 0 } as const;
const NO_ARP = { rate: 0 };

/** MIDI note numbers of the Cs. */
const C4 = 60;
const C2 = 36;
const C3 = 48;
const C5 = 72;
const C6 = 84;

/**
 * Starting points an author picks from before touching a slider, in the order they are offered.
 *
 * None of them is a sample: a sample is bytes the author brings, and a preset that named one
 * would point at nothing in every game but the one it was written in.
 */
export const INSTRUMENT_PRESETS: readonly InstrumentPresetEntry[] = [
  {
    name: 'Square lead',
    family: 'lead',
    blurb: 'The chiptune voice: bright, even, carries a melody over anything.',
    note: C4,
    settings: {
      osc: 'square',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.15 },
      vibrato: { rate: 6, depth: 0.15, delay: 0.2 },
      arp: NO_ARP,
      filter: NO_FILTER,
      volume: 0.8,
      pan: 0,
    },
  },
  {
    name: 'Pulse lead',
    family: 'lead',
    blurb: 'A thin pulse with a slow wobble — nasal, hollow, cuts through a mix.',
    note: C4,
    settings: {
      osc: 'square',
      duty: 0.125,
      detune: 0,
      glide: 0,
      env: { attack: 0.01, decay: 0.15, sustain: 0.5, release: 0.2 },
      vibrato: { rate: 5, depth: 0.2, delay: 0.3 },
      arp: NO_ARP,
      filter: NO_FILTER,
      volume: 0.75,
      pan: 0,
    },
  },
  {
    name: 'Saw lead',
    family: 'lead',
    blurb: 'Buzzier than the square, rounded off by a filter. Good for a solo line.',
    note: C4,
    settings: {
      osc: 'saw',
      duty: 0.5,
      detune: 0,
      glide: 0.02,
      env: { attack: 0.02, decay: 0.2, sustain: 0.6, release: 0.2 },
      vibrato: { rate: 5.5, depth: 0.1, delay: 0.25 },
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 6000, resonance: 0.2, envAmount: 0 },
      volume: 0.7,
      pan: 0,
    },
  },
  {
    name: 'Saw brass',
    family: 'lead',
    blurb: 'A brassy stab with a soft edge — write chords and it fills the room.',
    note: C4,
    settings: {
      osc: 'saw',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.05, decay: 0.15, sustain: 0.7, release: 0.2 },
      vibrato: { rate: 5, depth: 0.1, delay: 0.3 },
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 3000, resonance: 0.3, envAmount: 0 },
      volume: 0.7,
      pan: 0,
    },
  },
  {
    name: 'Chip arp',
    family: 'lead',
    blurb: 'Walks a chord one note at a time, fast. Write three notes on a step to hear it.',
    note: C4,
    settings: {
      osc: 'square',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.005, decay: 0.1, sustain: 0.5, release: 0.1 },
      vibrato: NO_VIBRATO,
      arp: { rate: 12 },
      filter: NO_FILTER,
      volume: 0.7,
      pan: 0,
    },
  },
  {
    name: 'Pulse bass',
    family: 'bass',
    blurb: 'A short, punchy pulse under the beat. The everyday bass.',
    note: C3,
    settings: {
      osc: 'square',
      duty: 0.25,
      detune: 0,
      glide: 0,
      env: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.1 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 1500, resonance: 0.3, envAmount: 0 },
      volume: 0.85,
      pan: 0,
    },
  },
  {
    name: 'Sub bass',
    family: 'bass',
    blurb: 'A pure low sine. Felt more than heard — keep it an octave under everything.',
    note: C2,
    settings: {
      osc: 'sine',
      duty: 0.5,
      detune: 0,
      glide: 0.03,
      env: { attack: 0.01, decay: 0.1, sustain: 0.9, release: 0.15 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 800, resonance: 0.1, envAmount: 0 },
      volume: 0.9,
      pan: 0,
    },
  },
  {
    name: 'Acid bass',
    family: 'bass',
    blurb: 'A saw through a squelchy filter, sliding between notes. Nervous, rubbery.',
    note: C3,
    settings: {
      osc: 'saw',
      duty: 0.5,
      detune: 0,
      glide: 0.08,
      env: { attack: 0.005, decay: 0.25, sustain: 0.3, release: 0.1 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 900, resonance: 0.7, envAmount: 0 },
      volume: 0.8,
      pan: 0,
    },
  },
  {
    name: 'Triangle bass',
    family: 'bass',
    blurb: 'Soft and round, the way a console bass sounds. Sits under a square lead.',
    note: C3,
    settings: {
      osc: 'triangle',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.005, decay: 0.15, sustain: 0.7, release: 0.1 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: NO_FILTER,
      volume: 0.9,
      pan: 0,
    },
  },
  {
    name: 'Triangle flute',
    family: 'keys',
    blurb: 'Breathy and gentle, with a slow vibrato. For a melody that is not in a hurry.',
    note: C5,
    settings: {
      osc: 'triangle',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.08, decay: 0.2, sustain: 0.8, release: 0.3 },
      vibrato: { rate: 5, depth: 0.2, delay: 0.25 },
      arp: NO_ARP,
      filter: NO_FILTER,
      volume: 0.8,
      pan: 0,
    },
  },
  {
    name: 'Bell',
    family: 'keys',
    blurb: 'Strikes and rings out. Best high up, one note at a time.',
    note: C5,
    settings: {
      osc: 'sine',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.6 },
      vibrato: { rate: 6, depth: 0.05, delay: 0.4 },
      arp: NO_ARP,
      filter: NO_FILTER,
      volume: 0.7,
      pan: 0,
    },
  },
  {
    name: 'Pluck',
    family: 'keys',
    blurb: 'A plucked string: sharp on, quick off. Arpeggios and picked chords.',
    note: C4,
    settings: {
      osc: 'saw',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.2 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 4000, resonance: 0.3, envAmount: 0 },
      volume: 0.8,
      pan: 0,
    },
  },
  {
    name: 'Organ',
    family: 'keys',
    blurb: 'Holds as long as the key does, no swell and no fade. Chords and drones.',
    note: C4,
    settings: {
      osc: 'square',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.01, decay: 0.05, sustain: 1, release: 0.05 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 5000, resonance: 0.1, envAmount: 0 },
      volume: 0.6,
      pan: 0,
    },
  },
  {
    name: 'Pad',
    family: 'pad',
    blurb: 'Swells in, hangs, fades out. The bed the rest of the music lies on.',
    note: C4,
    settings: {
      osc: 'saw',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.6, decay: 0.5, sustain: 0.8, release: 1.2 },
      vibrato: { rate: 4, depth: 0.1, delay: 0.5 },
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 1200, resonance: 0.3, envAmount: 0 },
      volume: 0.6,
      pan: 0,
    },
  },
  {
    name: 'Strings',
    family: 'pad',
    blurb: 'Bowed rather than struck: a slow rise, a slow vibrato, a long tail.',
    note: C4,
    settings: {
      osc: 'saw',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.4, decay: 0.3, sustain: 0.85, release: 0.8 },
      vibrato: { rate: 5, depth: 0.15, delay: 0.4 },
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 2500, resonance: 0.2, envAmount: 0 },
      volume: 0.6,
      pan: 0,
    },
  },
  {
    name: 'Choir',
    family: 'pad',
    blurb: 'Soft, hollow, far away. Voices without words.',
    note: C4,
    settings: {
      osc: 'triangle',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.5, decay: 0.4, sustain: 0.9, release: 1.0 },
      vibrato: { rate: 4, depth: 0.1, delay: 0.6 },
      arp: NO_ARP,
      filter: NO_FILTER,
      volume: 0.65,
      pan: 0,
    },
  },
  {
    // A kick is a pitch falling fast, and the model has no pitch envelope. What it has is
    // glide, which bends a voice from the note it was sounding into the next one: so this is
    // the thump on its own, a sine at a low note with no sustain, and the fall is there for
    // the taking by writing a higher note just before it.
    name: 'Kick',
    family: 'drums',
    blurb: 'The thump. Write a higher note just before it and the pitch falls into it.',
    note: C2,
    settings: {
      osc: 'sine',
      duty: 0.5,
      detune: 0,
      glide: 0.06,
      env: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 400, resonance: 0.2, envAmount: 0 },
      volume: 0.9,
      pan: 0,
    },
  },
  {
    name: 'Noise snare',
    family: 'drums',
    blurb: 'A burst of filtered noise on the backbeat.',
    note: C4,
    settings: {
      osc: 'noise',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'bp', cutoff: 2000, resonance: 0.4, envAmount: 0 },
      volume: 0.8,
      pan: 0,
    },
  },
  {
    name: 'Noise hat',
    family: 'drums',
    blurb: 'A tick of bright noise. Closed hat on every eighth, and the beat has a pulse.',
    note: C5,
    settings: {
      osc: 'noise',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'hp', cutoff: 6000, resonance: 0.2, envAmount: 0 },
      volume: 0.6,
      pan: 0,
    },
  },
  {
    name: 'Tom',
    family: 'drums',
    blurb: 'A round drum with some pitch to it — a kick played higher, and longer.',
    note: C3,
    settings: {
      osc: 'sine',
      duty: 0.5,
      detune: 0,
      glide: 0.1,
      env: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.15 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 700, resonance: 0.2, envAmount: 0 },
      volume: 0.85,
      pan: 0,
    },
  },
  {
    name: 'Clap',
    family: 'drums',
    blurb: 'A slap of mid noise, shorter and boxier than the snare.',
    note: C4,
    settings: {
      osc: 'noise',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.06 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'bp', cutoff: 1500, resonance: 0.5, envAmount: 0 },
      volume: 0.75,
      pan: 0,
    },
  },
  {
    name: 'Laser',
    family: 'fx',
    blurb: 'A zap that dives. Write it one note under a higher one and it falls between them.',
    note: C6,
    settings: {
      osc: 'square',
      duty: 0.5,
      detune: 0,
      glide: 0.2,
      env: { attack: 0.001, decay: 0.2, sustain: 0, release: 0.05 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: NO_FILTER,
      volume: 0.7,
      pan: 0,
    },
  },
  {
    name: 'Wind',
    family: 'fx',
    blurb: 'Noise that breathes in and out slowly. Weather, caves, a held breath.',
    note: C4,
    settings: {
      osc: 'noise',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 1.2 },
      vibrato: NO_VIBRATO,
      arp: NO_ARP,
      filter: { type: 'lp', cutoff: 1200, resonance: 0.4, envAmount: 0 },
      volume: 0.5,
      pan: 0,
    },
  },
];
