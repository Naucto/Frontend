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

const NO_VIBRATO = { rate: 5, depth: 0, delay: 0.2 };
const NO_FILTER = { type: 'off', cutoff: 8000, resonance: 0.2, envAmount: 0 } as const;

/**
 * Starting points an author picks from before touching a slider, in the order they are offered.
 *
 * None of them is a sample: a sample is bytes the author brings, and a preset that named one
 * would point at nothing in every game but the one it was written in.
 */
export const INSTRUMENT_PRESETS: readonly {
  readonly name: string;
  readonly settings: InstrumentPreset;
}[] = [
  {
    name: 'Square lead',
    settings: {
      osc: 'square',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.15 },
      vibrato: { rate: 6, depth: 0.15, delay: 0.2 },
      arp: { rate: 0 },
      filter: NO_FILTER,
      volume: 0.8,
      pan: 0,
    },
  },
  {
    name: 'Pulse bass',
    settings: {
      osc: 'square',
      duty: 0.25,
      detune: 0,
      glide: 0,
      env: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.1 },
      vibrato: NO_VIBRATO,
      arp: { rate: 0 },
      filter: { type: 'lp', cutoff: 1500, resonance: 0.3, envAmount: 0 },
      volume: 0.85,
      pan: 0,
    },
  },
  {
    name: 'Triangle flute',
    settings: {
      osc: 'triangle',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.08, decay: 0.2, sustain: 0.8, release: 0.3 },
      vibrato: { rate: 5, depth: 0.2, delay: 0.25 },
      arp: { rate: 0 },
      filter: NO_FILTER,
      volume: 0.8,
      pan: 0,
    },
  },
  {
    name: 'Saw brass',
    settings: {
      osc: 'saw',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.05, decay: 0.15, sustain: 0.7, release: 0.2 },
      vibrato: { rate: 5, depth: 0.1, delay: 0.3 },
      arp: { rate: 0 },
      filter: { type: 'lp', cutoff: 3000, resonance: 0.3, envAmount: 0 },
      volume: 0.7,
      pan: 0,
    },
  },
  {
    name: 'Noise hat',
    settings: {
      osc: 'noise',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
      vibrato: NO_VIBRATO,
      arp: { rate: 0 },
      filter: { type: 'hp', cutoff: 6000, resonance: 0.2, envAmount: 0 },
      volume: 0.6,
      pan: 0,
    },
  },
  {
    name: 'Noise snare',
    settings: {
      osc: 'noise',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
      vibrato: NO_VIBRATO,
      arp: { rate: 0 },
      filter: { type: 'bp', cutoff: 2000, resonance: 0.4, envAmount: 0 },
      volume: 0.8,
      pan: 0,
    },
  },
  {
    // A kick is a pitch falling fast, and the model has no pitch envelope. What it has is
    // glide, which bends a voice from the note it was sounding into the next one: so this is
    // the thump on its own, a sine at a low note with no sustain, and the fall is there for
    // the taking by writing a higher note just before it.
    name: 'Kick',
    settings: {
      osc: 'sine',
      duty: 0.5,
      detune: 0,
      glide: 0.06,
      env: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.08 },
      vibrato: NO_VIBRATO,
      arp: { rate: 0 },
      filter: { type: 'lp', cutoff: 400, resonance: 0.2, envAmount: 0 },
      volume: 0.9,
      pan: 0,
    },
  },
  {
    name: 'Pad',
    settings: {
      osc: 'saw',
      duty: 0.5,
      detune: 0,
      glide: 0,
      env: { attack: 0.6, decay: 0.5, sustain: 0.8, release: 1.2 },
      vibrato: { rate: 4, depth: 0.1, delay: 0.5 },
      arp: { rate: 0 },
      filter: { type: 'lp', cutoff: 1200, resonance: 0.3, envAmount: 0 },
      volume: 0.6,
      pan: 0,
    },
  },
];
