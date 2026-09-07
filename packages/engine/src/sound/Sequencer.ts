import { type Instrument, type Pattern, type Song } from './model';
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
  private stepInPattern = 0;
  private samplesToNextStep = 0;
  private playing = false;
  private fade = 1;
  private fadeRate = 0;
  private fadeTarget = 1;
  private stopWhenFaded = false;
  private readonly sfx: {
    pattern: Pattern;
    step: number;
    samplesToNext: number;
    pitchOffset: number;
    volume: number;
    channel?: number;
  }[] = [];

  constructor(
    private readonly synth: SynthCore,
    private readonly sampleRate: number,
  ) {}

  setLibrary(instruments: Map<string, Instrument>, patterns: Map<string, Pattern>): void {
    this.instruments = instruments;
    this.patterns = patterns;
  }

  playSong(song: Song, loop: boolean, fadeIn: number): void {
    this.song = { ...song, loop };
    this.seqIndex = 0;
    this.stepInPattern = 0;
    this.samplesToNextStep = 0;
    this.playing = song.sequence.length > 0;
    this.fade = fadeIn > 0 ? 0 : 1;
    this.fadeTarget = 1;
    this.fadeRate = fadeIn > 0 ? 1 / (fadeIn * this.sampleRate) : 0;
    this.stopWhenFaded = false;
    this.synth.musicGain = this.fade;
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
    this.sfx.push({ pattern, step: 0, samplesToNext: 0, pitchOffset, volume, channel });
  }

  stopAll(): void {
    this.playing = false;
    this.song = null;
    this.sfx.length = 0;
    this.synth.stopAll();
  }

  position(): SequencerPosition | null {
    return this.playing ? { pattern: this.seqIndex, step: this.stepInPattern } : null;
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
          if (lane.step >= lane.pattern.steps) {
            this.sfx.splice(i, 1);
            break;
          }
          this.triggerStep(lane.pattern, lane.step, lane.pitchOffset, lane.volume, 1, lane.channel);
          lane.samplesToNext = this.stepSamples(lane.pattern);
          lane.step++;
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
    while (left > 0 && this.playing) {
      const pattern = this.patterns.get(song.sequence[this.seqIndex] ?? '');
      if (!pattern) {
        if (!this.nextPattern(song)) return;
        continue;
      }
      if (this.samplesToNextStep <= 0) {
        if (this.stepInPattern >= pattern.steps) {
          if (!this.nextPattern(song)) return;
          continue;
        }
        this.triggerStep(pattern, this.stepInPattern, 0, 1, 0);
        this.samplesToNextStep = this.stepSamples(pattern);
        this.stepInPattern++;
      }
      const consume = Math.min(left, this.samplesToNextStep);
      this.samplesToNextStep -= consume;
      left -= consume;
    }
  }

  private nextPattern(song: Song): boolean {
    this.seqIndex++;
    this.stepInPattern = 0;
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

  private triggerStep(
    p: Pattern,
    step: number,
    pitchOffset: number,
    volume: number,
    priority: number,
    channel?: number,
  ): void {
    const secondsPerStep = 60 / p.bpm / p.stepsPerBeat;
    for (const n of p.notes) {
      if (n.step !== step) continue;
      const ins = this.instruments.get(n.instrument);
      if (!ins) continue;
      this.synth.noteOn(
        ins,
        n.pitch + pitchOffset,
        n.volume * volume,
        n.length * secondsPerStep,
        channel,
        priority,
      );
    }
  }

  private releaseMusicVoices(): void {
    this.synth.voices.forEach((v, i) => {
      if (v.active && v.priority === 0) this.synth.noteOff(i);
    });
  }
}
