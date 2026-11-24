import {
  BEATS_PER_BAR,
  type Instrument,
  type Note,
  type NoteSheet,
  type Pattern,
  type Song,
  SUBSTEPS,
} from './model';
import type { SynthCore } from './SynthCore';
import { TICKS_PER_BEAT, voicePlan } from './timeline';

export interface SequencerPosition {
  beat: number;
}

/**
 * Plays songs and SFX sample-accurately on top of a SynthCore. Music voices are
 * priority 0; SFX run on their own lane with priority 1 so they steal
 * music voices rather than the other way round. While a song plays, each of its tracks sounds on
 * the voices its plan gives it, and a sound effect on those kept for it; both may take a voice
 * nobody needs.
 */
export class Sequencer {
  private song: Song | null = null;
  private patterns = new Map<string, Pattern>();
  private instruments = new Map<string, Instrument>();
  private readonly noteTicks = new WeakMap<Pattern, Map<number, Note[]>>();
  private tick = 0;
  private samplesToNextTick = 0;
  private playing = false;
  private fade = 1;
  private fadeRate = 0;
  private fadeTarget = 1;
  private stopWhenFaded = false;
  /** Per track, the voice each instrument last sounded on, so a glide bends out of it. */
  private songVoices: Map<string, number>[] = [];
  /** Per track, the voices its notes may take while the song plays; then those of the SFX. */
  private trackVoices: number[][] = [];
  private sfxVoices: number[] = [];
  private readonly sfx: {
    sheet: NoteSheet;
    /** Counted in sub-steps. */
    subStep: number;
    samplesToNext: number;
    pitchOffset: number;
    volume: number;
    channel?: number;
    voices: Map<string, number>;
  }[] = [];

  constructor(
    private readonly synth: SynthCore,
    private readonly sampleRate: number,
  ) {}

  setLibrary(instruments: Map<string, Instrument>, patterns: Map<string, Pattern>): void {
    this.instruments = instruments;
    this.patterns = patterns;
    if (this.song) {
      this.planVoices(this.song);
    }
  }

  /** Worked out once per song or library, not per note: the worklet runs this every tick. */
  private planVoices(song: Song): void {
    const plan = voicePlan(song, this.patterns, this.instruments);
    this.trackVoices = plan.tracks.map((own) => [...own, ...plan.free]);
    this.sfxVoices = [...plan.sfx, ...plan.free];
  }

  /** `from` is where to begin, in beats from the song's start; the clock rounds it onto its ticks. */
  playSong(song: Song, loop: boolean, fadeIn: number, from = 0): void {
    this.song = { ...song, loop };
    this.songVoices = song.tracks.map(() => new Map<string, number>());
    this.planVoices(song);
    this.tick = Math.max(0, Math.round(from * TICKS_PER_BEAT));
    this.samplesToNextTick = 0;
    this.playing = song.blocks.length > 0;
    this.fade = fadeIn > 0 ? 0 : 1;
    this.fadeTarget = 1;
    this.fadeRate = fadeIn > 0 ? 1 / (fadeIn * this.sampleRate) : 0;
    this.stopWhenFaded = false;
    this.synth.musicGain = this.fade;
  }

  /** Changes whether the song already playing loops, without restarting it. */
  setLoop(loop: boolean): void {
    if (this.song) {
      this.song = { ...this.song, loop };
    }
  }

  setBpm(bpm: number): void {
    if (this.song) {
      this.song = { ...this.song, bpm };
    }
  }

  stopMusic(fadeOut: number): void {
    if (!this.playing) {
      return;
    }
    if (fadeOut <= 0) {
      this.playing = false;
      this.song = null;
      this.releaseMusicVoices();
      return;
    }
    this.fadeTarget = 0;
    this.fadeRate = 1 / (fadeOut * this.sampleRate);
    this.stopWhenFaded = true;
  }

  playSfx(sheet: NoteSheet, pitchOffset: number, volume: number, channel?: number): void {
    this.sfx.push({
      sheet,
      subStep: 0,
      samplesToNext: 0,
      pitchOffset,
      volume,
      channel,
      voices: new Map(),
    });
  }

  stopAll(): void {
    this.playing = false;
    this.song = null;
    this.sfx.length = 0;
    this.synth.stopAll();
  }

  /**
   * The tick sounding, in beats from the song's start; the counter runs one ahead of what is heard,
   * so this reports the previous one.
   */
  position(): SequencerPosition | null {
    if (!this.playing) {
      return null;
    }

    return { beat: Math.max(0, this.tick - 1) / TICKS_PER_BEAT };
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Advance the clock by `frames` samples, triggering notes that fall inside. */
  advance(frames: number): void {
    if (this.fadeRate > 0 && this.fade !== this.fadeTarget) {
      this.fade += Math.sign(this.fadeTarget - this.fade) * this.fadeRate * frames;
      this.fade = Math.max(0, Math.min(1, this.fade));
      this.synth.musicGain = this.fade;
      if (this.fade === this.fadeTarget && this.stopWhenFaded) {
        this.playing = false;
        this.song = null;
        this.releaseMusicVoices();
        this.synth.musicGain = 1;
      }
    }
    if (this.playing && this.song) {
      this.advanceSong(frames);
    }
    for (let i = this.sfx.length - 1; i >= 0; i--) {
      const lane = this.sfx[i];
      if (!lane) {
        continue;
      }
      let left = frames;
      while (left > 0) {
        if (lane.samplesToNext <= 0) {
          if (lane.subStep >= lane.sheet.steps * SUBSTEPS) {
            this.sfx.splice(i, 1);
            break;
          }
          this.triggerNotes(
            lane.sheet.notes.filter((note) => Math.round(note.step * SUBSTEPS) === lane.subStep),
            60 / lane.sheet.bpm / lane.sheet.stepsPerBeat,
            lane.pitchOffset,
            lane.volume,
            1,
            lane.voices,
            lane.channel,
            this.playing ? this.sfxVoices : [],
          );
          lane.samplesToNext = this.subStepSamples(lane.sheet, lane.subStep);
          lane.subStep++;
        }
        const consume = Math.min(left, lane.samplesToNext);
        lane.samplesToNext -= consume;
        left -= consume;
      }
    }
  }

  private advanceSong(frames: number): void {
    const song = this.song;
    if (!song) {
      return;
    }
    let left = frames;
    while (left > 0 && this.playing) {
      if (this.samplesToNextTick <= 0) {
        const end = this.endTick(song);
        const loopEnd = Math.min(
          end,
          song.loopEnd === undefined ? end : this.barTick(song.loopEnd),
        );
        const loopStart = this.barTick(song.loopStart);
        if (song.loop && loopEnd > loopStart && this.tick >= loopEnd) {
          this.tick = loopStart;
        } else if (this.tick >= end) {
          this.playing = false;
          this.song = null;
          return;
        }
        this.triggerTick(song, this.tick);
        this.samplesToNextTick = this.tickSamples(song.bpm, this.tick);
        this.tick++;
      }
      const consume = Math.min(left, this.samplesToNextTick);
      this.samplesToNextTick -= consume;
      left -= consume;
    }
  }

  private barTick(bars: number): number {
    return Math.round(bars * BEATS_PER_BAR * TICKS_PER_BEAT);
  }

  private patternTicks(pattern: Pattern): number {
    return Math.round((pattern.steps / pattern.stepsPerBeat) * TICKS_PER_BEAT);
  }

  private endTick(song: Song): number {
    let end = 0;
    for (const block of song.blocks) {
      const pattern = this.patterns.get(block.pattern);
      if (pattern) {
        end = Math.max(end, this.barTick(block.start) + this.patternTicks(pattern) * block.repeat);
      }
    }

    return end;
  }

  private notesByTick(pattern: Pattern): Map<number, Note[]> {
    const cached = this.noteTicks.get(pattern);
    if (cached) {
      return cached;
    }
    const byTick = new Map<number, Note[]>();
    const ticksPerStep = TICKS_PER_BEAT / pattern.stepsPerBeat;
    for (const note of pattern.notes) {
      if (note.step >= pattern.steps) {
        continue;
      }
      const at = Math.round(Math.round(note.step * SUBSTEPS) * (ticksPerStep / SUBSTEPS));
      const held = byTick.get(at);
      if (held) {
        held.push(note);
      } else {
        byTick.set(at, [note]);
      }
    }
    this.noteTicks.set(pattern, byTick);

    return byTick;
  }

  private triggerTick(song: Song, tick: number): void {
    for (const block of song.blocks) {
      const pattern = this.patterns.get(block.pattern);
      if (!pattern) {
        continue;
      }
      const length = this.patternTicks(pattern);
      const start = this.barTick(block.start);
      if (length <= 0 || tick < start || tick >= start + length * block.repeat) {
        continue;
      }
      const notes = this.notesByTick(pattern).get((tick - start) % length);
      const pool = this.trackVoices[block.track];
      const last = this.songVoices[block.track];
      if (notes && pool && last) {
        this.triggerNotes(
          notes,
          60 / song.bpm / pattern.stepsPerBeat,
          0,
          1,
          0,
          last,
          undefined,
          pool,
        );
      }
    }
  }

  private tickSamples(bpm: number, tick: number): number {
    const beat = Math.max(1, Math.round((60 / bpm) * this.sampleRate));
    const base = Math.floor(beat / TICKS_PER_BEAT);
    const spread = beat - base * TICKS_PER_BEAT;

    return base + (tick % TICKS_PER_BEAT < spread ? 1 : 0);
  }

  private stepSamples(sheet: NoteSheet): number {
    return Math.max(1, Math.round((60 / sheet.bpm / sheet.stepsPerBeat) * this.sampleRate));
  }

  /** Samples to the next sub-step, spread so a step's sub-steps sum exactly to its sample count. */
  private subStepSamples(sheet: NoteSheet, subStep: number): number {
    const step = this.stepSamples(sheet);
    const base = Math.floor(step / SUBSTEPS);
    const spread = step - base * SUBSTEPS;
    return base + (subStep % SUBSTEPS < spread ? 1 : 0);
  }

  private triggerNotes(
    struck: readonly Note[],
    secondsPerStep: number,
    pitchOffset: number,
    volume: number,
    priority: number,
    lastVoices: Map<string, number>,
    channel?: number,
    pool: readonly number[] = [],
  ): void {
    const byInstrument = new Map<string, Note[]>();
    for (const note of struck) {
      const held = byInstrument.get(note.instrument);
      if (held) {
        held.push(note);
      } else {
        byInstrument.set(note.instrument, [note]);
      }
    }
    for (const [id, notes] of byInstrument) {
      const ins = this.instruments.get(id);
      if (!ins) {
        continue;
      }
      let voice = channel;
      if (voice === undefined && ins.glide > 0 && (notes.length === 1 || ins.arp.rate > 0)) {
        const last = lastVoices.get(id);
        const held = last === undefined ? undefined : this.synth.voices[last];
        if (
          held?.active &&
          held.instrument === ins &&
          held.priority === priority &&
          (pool.length === 0 || (last !== undefined && pool.includes(last)))
        ) {
          voice = last;
        }
      }
      // An arpeggiating instrument walks the notes struck together on one voice.
      if (ins.arp.rate > 0 && notes.length > 1) {
        const chord = [...notes].sort((a, b) => a.pitch - b.pitch);
        const root = chord[0];
        if (!root) {
          continue;
        }
        const used = this.synth.noteOn(
          ins,
          root.pitch + pitchOffset,
          Math.max(...notes.map((note) => note.volume)) * volume,
          Math.max(...notes.map((note) => note.length)) * secondsPerStep,
          voice,
          priority,
          chord.map((note) => note.pitch - root.pitch),
          pool,
        );
        lastVoices.set(id, used);
        continue;
      }
      for (const note of notes) {
        const used = this.synth.noteOn(
          ins,
          note.pitch + pitchOffset,
          note.volume * volume,
          note.length * secondsPerStep,
          voice,
          priority,
          [],
          pool,
        );
        lastVoices.set(id, used);
      }
    }
  }

  private releaseMusicVoices(): void {
    this.synth.voices.forEach((voice, i) => {
      if (voice.active && voice.priority === 0) {
        this.synth.noteOff(i);
      }
    });
  }
}
