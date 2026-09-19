import { type FilterType, noteNameToMidi, type OscType } from '../sound/model';
import { type Bound, INSTRUMENT_BOUNDS, PATTERN_BOUNDS } from '../sound/presets';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import type { InstrumentPatch, PatternPatch, SongPatch } from './ports';

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const opt = (v: unknown): number | undefined => (typeof v === 'number' ? Math.floor(v) : undefined);
const clamp = (v: number, b: Bound): number => Math.min(b.max, Math.max(b.min, v));
const table = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};

const OSC: readonly OscType[] = ['square', 'sine', 'triangle', 'saw', 'noise', 'sample'];
const FILTER: readonly FilterType[] = ['off', 'lp', 'hp', 'bp'];
const isOsc = (v: unknown): v is OscType => OSC.includes(v as OscType);
const isFilter = (v: unknown): v is FilterType => FILTER.includes(v as FilterType);

/** Each number a game may set on an instrument: the range it is kept in, and where it lands. */
const INSTRUMENT_FIELDS: Record<string, [Bound, (p: InstrumentPatch, v: number) => void]> = {
  duty: [INSTRUMENT_BOUNDS.duty, (p, v) => (p.duty = v)],
  detune: [INSTRUMENT_BOUNDS.detune, (p, v) => (p.detune = v)],
  glide: [INSTRUMENT_BOUNDS.glide, (p, v) => (p.glide = v)],
  attack: [INSTRUMENT_BOUNDS.env.attack, (p, v) => ((p.env ??= {}).attack = v)],
  decay: [INSTRUMENT_BOUNDS.env.decay, (p, v) => ((p.env ??= {}).decay = v)],
  sustain: [INSTRUMENT_BOUNDS.env.sustain, (p, v) => ((p.env ??= {}).sustain = v)],
  release: [INSTRUMENT_BOUNDS.env.release, (p, v) => ((p.env ??= {}).release = v)],
  vibrato_rate: [INSTRUMENT_BOUNDS.vibrato.rate, (p, v) => ((p.vibrato ??= {}).rate = v)],
  vibrato_depth: [INSTRUMENT_BOUNDS.vibrato.depth, (p, v) => ((p.vibrato ??= {}).depth = v)],
  vibrato_delay: [INSTRUMENT_BOUNDS.vibrato.delay, (p, v) => ((p.vibrato ??= {}).delay = v)],
  arp_rate: [INSTRUMENT_BOUNDS.arp.rate, (p, v) => ((p.arp ??= {}).rate = v)],
  cutoff: [INSTRUMENT_BOUNDS.filter.cutoff, (p, v) => ((p.filter ??= {}).cutoff = v)],
  resonance: [INSTRUMENT_BOUNDS.filter.resonance, (p, v) => ((p.filter ??= {}).resonance = v)],
  volume: [INSTRUMENT_BOUNDS.volume, (p, v) => (p.volume = v)],
  pan: [INSTRUMENT_BOUNDS.pan, (p, v) => (p.pan = v)],
};

/** The `sound` namespace. Silent no-ops when no audio backend is attached. */
export class SoundAPI extends EngineModule {
  /** A game sets a sound every frame as readily as once, so each complaint is made once. */
  private readonly warned = new Set<string>();

  constructor(ctx: ApiContext) {
    super(ctx);
    const s = (): ApiContext['sound'] => ctx.sound;
    const warn = (text: string): void => {
      if (this.warned.has(text)) return;
      this.warned.add(text);
      ctx.log('warn', text);
    };
    ctx.lua.setGlobalWith('sound', {
      play_sfx: (slot: unknown, ch?: unknown, pitch?: unknown, vol?: unknown) => {
        s()?.playSfx(Math.floor(num(slot)), opt(ch), num(pitch), num(vol, 1));
      },
      play_note: (inst: unknown, pitch: unknown, len?: unknown, vol?: unknown, ch?: unknown) => {
        const midi = typeof pitch === 'string' ? (noteNameToMidi(pitch) ?? 60) : num(pitch, 60);
        s()?.playNote(String(inst), midi, num(len, 0.25), num(vol, 1), opt(ch));
      },
      stop_note: (ch: unknown) => {
        s()?.stopNote(Math.floor(num(ch)));
      },
      play_music: (song?: unknown, loop?: unknown, fade?: unknown) => {
        s()?.playMusic(
          Math.floor(num(song)),
          loop === undefined ? undefined : Boolean(loop),
          num(fade),
        );
      },
      stop_music: (fade?: unknown) => {
        s()?.stopMusic(num(fade));
      },
      stop: () => {
        s()?.stopAll();
      },
      set_volume: (m: unknown, mu?: unknown, sf?: unknown) => {
        s()?.setVolume(
          num(m, 1),
          typeof mu === 'number' ? mu : undefined,
          typeof sf === 'number' ? sf : undefined,
        );
      },
      music_position: () => {
        const p = s()?.musicPosition();
        // Rounded up to a whole step, because a game compares this against a note's own step and
        // the clock spends most of each step between two of them.
        return p ? [p.pattern, Math.ceil(p.step)] : [undefined, undefined];
      },
      is_playing: (ch: unknown) => s()?.isPlaying(Math.floor(num(ch))) ?? false,
      set_instrument: (name: unknown, fields: unknown) => {
        const patch: InstrumentPatch = {};
        for (const [key, v] of Object.entries(table(fields))) {
          const field = INSTRUMENT_FIELDS[key];
          if (field) {
            if (typeof v === 'number' && Number.isFinite(v)) field[1](patch, clamp(v, field[0]));
            else warn(`sound.set_instrument: ${key} takes a number`);
          } else if (key === 'osc') {
            if (isOsc(v)) patch.osc = v;
            else warn(`sound.set_instrument: osc is one of ${OSC.join(', ')}`);
          } else if (key === 'filter') {
            if (isFilter(v)) (patch.filter ??= {}).type = v;
            else warn(`sound.set_instrument: filter is one of ${FILTER.join(', ')}`);
          } else warn(`sound.set_instrument: "${key}" is not an instrument field`);
        }
        const port = s();
        if (port && !port.setInstrumentOverride(String(name), patch))
          warn(`sound.set_instrument: there is no instrument called "${String(name)}"`);
      },
      set_pattern: (n: unknown, fields: unknown) => {
        const patch: PatternPatch = {};
        for (const [key, v] of Object.entries(table(fields))) {
          if (key !== 'bpm' && key !== 'steps') {
            warn(`sound.set_pattern: "${key}" is not a pattern field`);
          } else if (typeof v !== 'number' || !Number.isFinite(v)) {
            warn(`sound.set_pattern: ${key} takes a number`);
          } else if (key === 'bpm') patch.bpm = clamp(v, PATTERN_BOUNDS.bpm);
          else patch.steps = clamp(Math.round(v), PATTERN_BOUNDS.steps);
        }
        const port = s();
        const slot = Math.floor(num(n, -1));
        if (port && !port.setPatternOverride(slot, patch))
          warn(`sound.set_pattern: there is no pattern ${String(slot)}`);
      },
      set_music: (n: unknown, fields: unknown) => {
        const patch: SongPatch = {};
        for (const [key, v] of Object.entries(table(fields))) {
          if (key === 'loop') patch.loop = Boolean(v);
          else warn(`sound.set_music: "${key}" is not a music field`);
        }
        const port = s();
        const slot = Math.floor(num(n, -1));
        if (port && !port.setSongOverride(slot, patch))
          warn(`sound.set_music: there is no music ${String(slot)}`);
      },
    });
  }

  /**
   * A run that is over is silent: its music does not play under the next one, or after STOP. Nor
   * does what it changed about a sound outlive it.
   */
  override destroy(): void {
    this.ctx.sound?.stopAll();
    this.ctx.sound?.clearOverrides();
  }
}
