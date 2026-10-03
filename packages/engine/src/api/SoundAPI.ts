import { type FilterType, noteNameToMidi, type OscType } from '../sound/model';
import { type Bound, INSTRUMENT_BOUNDS, PATTERN_BOUNDS } from '../sound/presets';
import type { ApiContext } from './ApiContext';
import { EngineModule } from './EngineModule';
import { luaNumber } from './lua-args';
import { defineLuaNamespace, luaFn, param } from './lua-namespace';
import type { InstrumentPatch, PatternPatch, SongPatch } from './ports';

// Lua truth: only nil and false are false, so `0` and `""` count as given and true.
const truthy = (value: unknown): boolean =>
  value !== false && value !== undefined && value !== null;
const clamp = (value: number, bound: Bound): number =>
  Math.min(bound.max, Math.max(bound.min, value));

const OSC: readonly OscType[] = ['square', 'sine', 'triangle', 'saw', 'noise', 'sample'];
const FILTER: readonly FilterType[] = ['off', 'lp', 'hp', 'bp'];
const isOsc = (value: unknown): value is OscType => OSC.includes(value as OscType);
const isFilter = (value: unknown): value is FilterType => FILTER.includes(value as FilterType);

/** Each number a game may set on an instrument: the range it is kept in, and where it lands. */
const INSTRUMENT_FIELDS: Record<string, [Bound, (patch: InstrumentPatch, value: number) => void]> =
  {
    duty: [INSTRUMENT_BOUNDS.duty, (patch, value) => (patch.duty = value)],
    detune: [INSTRUMENT_BOUNDS.detune, (patch, value) => (patch.detune = value)],
    glide: [INSTRUMENT_BOUNDS.glide, (patch, value) => (patch.glide = value)],
    attack: [INSTRUMENT_BOUNDS.env.attack, (patch, value) => ((patch.env ??= {}).attack = value)],
    decay: [INSTRUMENT_BOUNDS.env.decay, (patch, value) => ((patch.env ??= {}).decay = value)],
    sustain: [
      INSTRUMENT_BOUNDS.env.sustain,
      (patch, value) => ((patch.env ??= {}).sustain = value),
    ],
    release: [
      INSTRUMENT_BOUNDS.env.release,
      (patch, value) => ((patch.env ??= {}).release = value),
    ],
    vibrato_rate: [
      INSTRUMENT_BOUNDS.vibrato.rate,
      (patch, value) => ((patch.vibrato ??= {}).rate = value),
    ],
    vibrato_depth: [
      INSTRUMENT_BOUNDS.vibrato.depth,
      (patch, value) => ((patch.vibrato ??= {}).depth = value),
    ],
    vibrato_delay: [
      INSTRUMENT_BOUNDS.vibrato.delay,
      (patch, value) => ((patch.vibrato ??= {}).delay = value),
    ],
    arp_rate: [INSTRUMENT_BOUNDS.arp.rate, (patch, value) => ((patch.arp ??= {}).rate = value)],
    cutoff: [
      INSTRUMENT_BOUNDS.filter.cutoff,
      (patch, value) => ((patch.filter ??= {}).cutoff = value),
    ],
    resonance: [
      INSTRUMENT_BOUNDS.filter.resonance,
      (patch, value) => ((patch.filter ??= {}).resonance = value),
    ],
    volume: [INSTRUMENT_BOUNDS.volume, (patch, value) => (patch.volume = value)],
    pan: [INSTRUMENT_BOUNDS.pan, (patch, value) => (patch.pan = value)],
  };

/** A slot no pattern or music has, for a number that is not one. */
const NO_SLOT = -1;

export const SOUND_API = defineLuaNamespace<SoundAPI>('sound', {
  play_sfx: luaFn(
    {
      summary: 'Play a numbered SFX slot.',
      params: [
        param.int('slot'),
        param.int('channel', { optional: true }),
        param.number('pitch_offset', { default: 0 }),
        param.number('volume', { default: 1 }),
      ],
      returns: null,
    },
    'playSfx',
  ),
  play_note: luaFn(
    {
      summary: 'Play a note now; pitch is MIDI or "C4".',
      params: [
        param.string('instrument'),
        param.any('pitch', { type: 'number|string' }),
        param.number('length', { default: 0.25 }),
        param.number('volume', { default: 1 }),
        param.int('channel', { optional: true }),
      ],
      returns: null,
    },
    'playNote',
  ),
  stop_note: luaFn(
    { summary: 'Release a voice.', params: [param.int('channel')], returns: null },
    'stopNote',
  ),
  play_music: luaFn(
    {
      summary: 'Start a music; loops from its start unless told otherwise.',
      params: [
        param.int('song', { default: 0 }),
        param.bool('loop', { optional: true, defaultsTo: "the music's own setting" }),
        param.number('fade_in', { default: 0 }),
      ],
      returns: null,
    },
    'playMusic',
  ),
  stop_music: luaFn(
    {
      summary: 'Stop the music.',
      params: [param.number('fade_out', { default: 0 })],
      returns: null,
    },
    'stopMusic',
  ),
  stop: luaFn({ summary: 'Stop everything.', params: [], returns: null }, 'stop'),
  set_volume: luaFn(
    {
      summary: 'Mixer levels 0..1.',
      params: [
        param.number('master', { default: 1 }),
        param.number('music', { optional: true, defaultsTo: 'unchanged' }),
        param.number('sfx', { optional: true, defaultsTo: 'unchanged' }),
      ],
      returns: null,
    },
    'setVolume',
  ),
  music_pos: luaFn(
    {
      summary:
        "Place in the music's chain and the step now sounding, 0-based; nil when nothing plays.",
      params: [],
      returns: 'number|nil',
    },
    'musicPosition',
  ),
  is_playing: luaFn(
    {
      summary: 'Whether a voice is sounding.',
      params: [param.int('channel')],
      returns: 'boolean',
    },
    'isPlaying',
  ),
  set_instrument: luaFn(
    {
      summary: 'Change an instrument for this run.',
      params: [param.string('name'), param.table('fields')],
      returns: null,
    },
    'setInstrument',
  ),
  set_pattern: luaFn(
    {
      summary: 'Change the tempo or length of a pattern for this run.',
      params: [param.int('n', { fallback: NO_SLOT }), param.table('fields')],
      returns: null,
    },
    'setPattern',
  ),
  set_music: luaFn(
    {
      summary: 'Change whether a music loops for this run.',
      params: [param.int('n', { fallback: NO_SLOT }), param.table('fields')],
      returns: null,
    },
    'setMusic',
  ),
});

/** The `sound` namespace. Silent no-ops when no audio backend is attached. */
export class SoundAPI extends EngineModule {
  /** A game sets a sound every frame as readily as once, so each complaint is made once. */
  private readonly warned = new Set<string>();

  constructor(ctx: ApiContext) {
    super(ctx);
    ctx.lua.registerNamespace(SOUND_API, this);
  }

  private warn(text: string): void {
    if (this.warned.has(text)) {
      return;
    }
    this.warned.add(text);
    this.ctx.log('warn', text);
  }

  playSfx(slot: number, channel: number | undefined, pitchOffset: number, volume: number): void {
    this.ctx.sound?.playSfx(slot, channel, pitchOffset, volume);
  }

  /** `pitch` is a MIDI number or a note name such as "C4"; either reads as 60 when it is not one. */
  playNote(
    instrument: string,
    pitch: unknown,
    length: number,
    volume: number,
    channel: number | undefined,
  ): void {
    const midi = typeof pitch === 'string' ? (noteNameToMidi(pitch) ?? 60) : luaNumber(pitch, 60);
    const port = this.ctx.sound;
    if (port && !port.playNote(instrument, midi, length, volume, channel)) {
      this.warn(`sound.play_note: there is no instrument called "${instrument}"`);
    }
  }

  stopNote(channel: number): void {
    this.ctx.sound?.stopNote(channel);
  }

  /** `loop` left undefined keeps the music's own setting. */
  playMusic(song: number, loop: boolean | undefined, fadeIn: number): void {
    this.ctx.sound?.playMusic(song, loop, fadeIn);
  }

  stopMusic(fadeOut: number): void {
    this.ctx.sound?.stopMusic(fadeOut);
  }

  stop(): void {
    this.ctx.sound?.stopAll();
  }

  /** A level left undefined keeps its value. */
  setVolume(master: number, music: number | undefined, sfx: number | undefined): void {
    this.ctx.sound?.setVolume(master, music, sfx);
  }

  /** The place in the chain and the whole step sounding, or two nils while nothing plays. */
  musicPosition(): [number, number] | [undefined, undefined] {
    const position = this.ctx.sound?.musicPosition();
    return position ? [position.pattern, Math.floor(position.step)] : [undefined, undefined];
  }

  isPlaying(channel: number): boolean {
    return this.ctx.sound?.isPlaying(channel) ?? false;
  }

  setInstrument(name: string, fields: Readonly<Record<string, unknown>>): void {
    const patch: InstrumentPatch = {};
    for (const [key, value] of Object.entries(fields)) {
      const field = INSTRUMENT_FIELDS[key];
      if (field) {
        if (typeof value === 'number' && Number.isFinite(value)) {
          field[1](patch, clamp(value, field[0]));
        } else {
          this.warn(`sound.set_instrument: ${key} takes a number`);
        }
      } else if (key === 'osc') {
        if (isOsc(value)) {
          patch.osc = value;
        } else {
          this.warn(`sound.set_instrument: osc is one of ${OSC.join(', ')}`);
        }
      } else if (key === 'filter') {
        if (isFilter(value)) {
          (patch.filter ??= {}).type = value;
        } else {
          this.warn(`sound.set_instrument: filter is one of ${FILTER.join(', ')}`);
        }
      } else {
        this.warn(`sound.set_instrument: "${key}" is not an instrument field`);
      }
    }
    const port = this.ctx.sound;
    if (port && !port.setInstrumentOverride(name, patch)) {
      this.warn(`sound.set_instrument: there is no instrument called "${name}"`);
    }
  }

  setPattern(slot: number, fields: Readonly<Record<string, unknown>>): void {
    const patch: PatternPatch = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key !== 'bpm' && key !== 'steps') {
        this.warn(`sound.set_pattern: "${key}" is not a pattern field`);
      } else if (typeof value !== 'number' || !Number.isFinite(value)) {
        this.warn(`sound.set_pattern: ${key} takes a number`);
      } else if (key === 'bpm') {
        patch.bpm = clamp(value, PATTERN_BOUNDS.bpm);
      } else {
        patch.steps = clamp(Math.round(value), PATTERN_BOUNDS.steps);
      }
    }
    const port = this.ctx.sound;
    if (port && !port.setPatternOverride(slot, patch)) {
      this.warn(`sound.set_pattern: there is no pattern ${String(slot)}`);
    }
  }

  setMusic(slot: number, fields: Readonly<Record<string, unknown>>): void {
    const patch: SongPatch = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'loop') {
        patch.loop = truthy(value);
      } else {
        this.warn(`sound.set_music: "${key}" is not a music field`);
      }
    }
    const port = this.ctx.sound;
    if (port && !port.setSongOverride(slot, patch)) {
      this.warn(`sound.set_music: there is no music ${String(slot)}`);
    }
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
