import { type Instrument, type Note, type Pattern, type Song, SUBSTEPS } from './model';
import type { SynthCore } from './SynthCore';

export interface SequencerPosition {
  pattern: number;
  step: number;
}

/**
 * Plays patterns/songs sample-accurately on top of a SynthCore. Music voices are
 * priority 0; SFX patterns run on their own lane with priority 1 so they steal
 * music voices rather than the other way round.
 */
export class Sequencer {
  private song: Song | null = null;
  private patterns = new Map<string, Pattern>();
  private instruments = new Map<string, Instrument>();
  private seqIndex = 0;
  /** Position in the current pattern, counted in sub-steps rather than steps. */
  private subStep = 0;
  private samplesToNextSubStep = 0;
  private playing = false;
  private fade = 1;
  private fadeRate = 0;
  private fadeTarget = 1;
  private stopWhenFaded = false;
  /** The voice each instrument last sounded on in the song lane, so a glide bends out of it. */
  private songVoices = new Map<string, number>();
  private readonly sfx: {
    pattern: Pattern;
    /** Counted in sub-steps, like the song lane's. */
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
  }

  /** `from` is where in the first pattern to begin, in steps; the clock rounds it onto its lattice. */
  playSong(song: Song, loop: boolean, fadeIn: number, from = 0): void {
    this.song = { ...song, loop };
    this.songVoices = new Map();
    this.seqIndex = 0;
    this.subStep = Math.max(0, Math.round(from * SUBSTEPS));
    this.samplesToNextSubStep = 0;
    this.playing = song.sequence.length > 0;
    this.fade = fadeIn > 0 ? 0 : 1;
    this.fadeTarget = 1;
    this.fadeRate = fadeIn > 0 ? 1 / (fadeIn * this.sampleRate) : 0;
    this.stopWhenFaded = false;
    this.synth.musicGain = this.fade;
  }

  /** Changes whether the song already playing loops, without restarting it. */
  setLoop(loop: boolean): void {
    if (this.song) this.song = { ...this.song, loop };
  }

  stopMusic(fadeOut: number): void {
    if (!this.playing) return;
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

  playSfx(pattern: Pattern, pitchOffset: number, volume: number, channel?: number): void {
    this.sfx.push({
      pattern,
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
   * The sub-step sounding, in fractional steps; the counter runs one ahead of what is heard, so
   * this reports the previous one.
   */
  position(): SequencerPosition | null {
    if (!this.playing) return null;

    return { pattern: this.seqIndex, step: Math.max(0, this.subStep - 1) / SUBSTEPS };
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
    if (this.playing && this.song) this.advanceSong(frames);
    for (let i = this.sfx.length - 1; i >= 0; i--) {
      const lane = this.sfx[i];
      if (!lane) continue;
      let left = frames;
      while (left > 0) {
        if (lane.samplesToNext <= 0) {
          if (lane.subStep >= lane.pattern.steps * SUBSTEPS) {
            this.sfx.splice(i, 1);
            break;
          }
          this.triggerSubStep(
            lane.pattern,
            lane.subStep,
            lane.pitchOffset,
            lane.volume,
            1,
            lane.voices,
            lane.channel,
          );
          lane.samplesToNext = this.subStepSamples(lane.pattern, lane.subStep);
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
    if (!song) return;
    let left = frames;
    // Places passed since the last note triggered; a whole lap of them means nothing will sound.
    let skipped = 0;
    while (left > 0 && this.playing) {
      const entry = song.sequence[this.seqIndex] ?? null;
      // An empty place ends the music where it stands. A pattern that has since been deleted does
      // not: the place was filled, so the chain carries on to the next one.
      if (entry === null) {
        this.playing = false;
        this.song = null;
        return;
      }
      const pattern = this.patterns.get(entry);
      if (
        !pattern ||
        (this.samplesToNextSubStep <= 0 && this.subStep >= pattern.steps * SUBSTEPS)
      ) {
        if (++skipped > song.sequence.length) {
          this.playing = false;
          this.song = null;
          return;
        }
        if (!this.nextPattern(song)) return;
        continue;
      }
      if (this.samplesToNextSubStep <= 0) {
        skipped = 0;
        this.triggerSubStep(pattern, this.subStep, 0, 1, 0, this.songVoices);
        this.samplesToNextSubStep = this.subStepSamples(pattern, this.subStep);
        this.subStep++;
      }
      const consume = Math.min(left, this.samplesToNextSubStep);
      this.samplesToNextSubStep -= consume;
      left -= consume;
    }
  }

  private nextPattern(song: Song): boolean {
    this.seqIndex++;
    this.subStep = 0;
    if (this.seqIndex >= song.sequence.length) {
      if (!song.loop) {
        this.playing = false;
        this.song = null;
        return false;
      }
      this.seqIndex = Math.min(song.loopStart, song.sequence.length - 1);
    }
    return true;
  }

  private stepSamples(p: Pattern): number {
    return Math.max(1, Math.round((60 / p.bpm / p.stepsPerBeat) * this.sampleRate));
  }

  /** Samples to the next sub-step, spread so a step's sub-steps sum exactly to its sample count. */
  private subStepSamples(p: Pattern, subStep: number): number {
    const step = this.stepSamples(p);
    const base = Math.floor(step / SUBSTEPS);
    const spread = step - base * SUBSTEPS;
    return base + (subStep % SUBSTEPS < spread ? 1 : 0);
  }

  private triggerSubStep(
    p: Pattern,
    subStep: number,
    pitchOffset: number,
    volume: number,
    priority: number,
    lastVoices: Map<string, number>,
    channel?: number,
  ): void {
    const secondsPerStep = 60 / p.bpm / p.stepsPerBeat;
    const byInstrument = new Map<string, Note[]>();
    for (const n of p.notes) {
      if (Math.round(n.step * SUBSTEPS) !== subStep) continue;
      const held = byInstrument.get(n.instrument);
      if (held) held.push(n);
      else byInstrument.set(n.instrument, [n]);
    }
    for (const [id, notes] of byInstrument) {
      const ins = this.instruments.get(id);
      if (!ins) continue;
      let voice = channel;
      if (voice === undefined && ins.glide > 0 && (notes.length === 1 || ins.arp.rate > 0)) {
        const last = lastVoices.get(id);
        const held = last === undefined ? undefined : this.synth.voices[last];
        if (held?.active && held.instrument === ins && held.priority === priority) voice = last;
      }
      // An arpeggiating instrument walks the notes struck together on one voice.
      if (ins.arp.rate > 0 && notes.length > 1) {
        const chord = [...notes].sort((a, b) => a.pitch - b.pitch);
        const root = chord[0];
        if (!root) continue;
        const used = this.synth.noteOn(
          ins,
          root.pitch + pitchOffset,
          Math.max(...notes.map((n) => n.volume)) * volume,
          Math.max(...notes.map((n) => n.length)) * secondsPerStep,
          voice,
          priority,
          chord.map((n) => n.pitch - root.pitch),
        );
        lastVoices.set(id, used);
        continue;
      }
      for (const n of notes) {
        const used = this.synth.noteOn(
          ins,
          n.pitch + pitchOffset,
          n.volume * volume,
          n.length * secondsPerStep,
          voice,
          priority,
        );
        lastVoices.set(id, used);
      }
    }
  }

  private releaseMusicVoices(): void {
    this.synth.voices.forEach((v, i) => {
      if (v.active && v.priority === 0) this.synth.noteOff(i);
    });
  }
}
