import { C4, type Instrument, midiToFrequency, VOICES } from './model';

/** Where a voice's envelope is. A voice at `Release` or past it no longer holds its note. */
const enum Stage {
  Attack,
  Decay,
  Sustain,
  Release,
  Done,
}

/** Envelope level under which a releasing voice is inaudible, and is freed. */
const SILENCE = 0.0005;
/** Highest resonance: at 1 the filter has no damping left and rings on its own. */
const MAX_RESONANCE = 0.98;
/** Highest cutoff, as a fraction of the sample rate; the filter diverges towards Nyquist. */
const MAX_CUTOFF_RATIO = 0.45;

/** One playing voice. All times are in samples. */
interface Voice {
  active: boolean;
  instrument: Instrument | null;
  pitch: number;
  /** Target frequency of the note being played. */
  freq: number;
  /** Frequency actually sounding; slides towards `freq` when the instrument glides. */
  curFreq: number;
  phase: number;
  age: number;
  stage: Stage;
  env: number;
  releaseAt: number; // samples until release (-1 = until stopNote)
  releaseFrom: number;
  velocity: number;
  noiseSeed: number;
  lastNoise: number;
  // state variable filter
  low: number;
  band: number;
  sample: Float32Array | null;
  samplePos: number;
  priority: number;
  /** Semitones above this voice's own note that it cycles through, empty when it holds one note. */
  arp: readonly number[];
}

const newVoice = (): Voice => ({
  active: false,
  instrument: null,
  pitch: C4,
  freq: midiToFrequency(C4),
  curFreq: midiToFrequency(C4),
  phase: 0,
  age: 0,
  stage: Stage.Done,
  env: 0,
  releaseAt: -1,
  releaseFrom: 0,
  velocity: 1,
  noiseSeed: 0x1234,
  lastNoise: 0,
  low: 0,
  band: 0,
  sample: null,
  samplePos: 0,
  priority: 0,
  arp: [],
});

/**
 * Pure-TS chip synthesiser with no Web Audio dependency, so tests and the AudioWorklet render it
 * identically.
 */
export class SynthCore {
  readonly voices: Voice[] = Array.from({ length: VOICES }, newVoice);
  readonly samples = new Map<string, Float32Array>();
  master = 1;
  /** The song's fade; `musicLevel` is the volume the game asks for. Both scale the music. */
  musicGain = 1;
  musicLevel = 1;
  sfxGain = 1;

  constructor(readonly sampleRate: number) {}

  /**
   * Start a note; returns the voice index used, or -1 when every voice holds a higher priority.
   * `channel` forces a voice.
   */
  noteOn(
    instrument: Instrument,
    pitch: number,
    velocity: number,
    lengthSeconds: number,
    channel?: number,
    priority = 0,
    arp: readonly number[] = [],
  ): number {
    const idx =
      channel !== undefined ? Math.max(0, Math.min(VOICES - 1, channel)) : this.allocate(priority);
    if (idx === -1) {
      return idx;
    }
    const voice = this.voices[idx];
    if (!voice) {
      return idx;
    }
    // Glide slides from whatever this voice was already sounding, so retriggering the same voice
    // bends into the new note; a fresh voice starts on pitch.
    const wasSounding = voice.active && voice.stage !== Stage.Done;
    voice.active = true;
    voice.instrument = instrument;
    voice.pitch = pitch;
    voice.freq = midiToFrequency(pitch);
    voice.curFreq = instrument.glide > 0 && wasSounding ? voice.curFreq : voice.freq;
    voice.phase = 0;
    voice.age = 0;
    voice.stage = Stage.Attack;
    voice.env = 0;
    voice.velocity = Math.max(0, Math.min(1, velocity));
    voice.releaseAt = lengthSeconds > 0 ? Math.round(lengthSeconds * this.sampleRate) : -1;
    voice.low = 0;
    voice.band = 0;
    voice.priority = priority;
    voice.arp = arp;
    voice.sample =
      instrument.osc === 'sample' && instrument.sampleId
        ? (this.samples.get(instrument.sampleId) ?? null)
        : null;
    voice.samplePos = 0;
    return idx;
  }

  noteOff(channel: number): void {
    const voice = this.voices[channel];
    if (voice?.active && voice.stage < Stage.Release) {
      this.release(voice);
    }
  }

  stopAll(): void {
    for (const voice of this.voices) {
      voice.active = false;
      voice.stage = Stage.Done;
    }
  }

  isPlaying(channel: number): boolean {
    return this.voices[channel]?.active ?? false;
  }

  render(outL: Float32Array, outR: Float32Array, frames: number): void {
    outL.fill(0, 0, frames);
    outR.fill(0, 0, frames);
    for (const voice of this.voices) {
      if (!voice.active || !voice.instrument) {
        continue;
      }
      this.renderVoice(voice, outL, outR, frames);
    }
    for (let i = 0; i < frames; i++) {
      outL[i] = softClip((outL[i] ?? 0) * this.master);
      outR[i] = softClip((outR[i] ?? 0) * this.master);
    }
  }

  private allocate(priority: number): number {
    let free = this.voices.findIndex((voice) => !voice.active);
    if (free !== -1) {
      return free;
    }
    let best = Infinity;
    this.voices.forEach((voice, i) => {
      if (voice.priority > priority) {
        return;
      }
      const score = voice.priority * 1e9 - voice.age;
      if (score < best) {
        best = score;
        free = i;
      }
    });
    return free;
  }

  private release(voice: Voice): void {
    voice.stage = Stage.Release;
    voice.releaseFrom = voice.env;
  }

  private renderVoice(voice: Voice, outL: Float32Array, outR: Float32Array, frames: number): void {
    const ins = voice.instrument;
    if (!ins) {
      return;
    }
    const sr = this.sampleRate;
    const env = ins.env;
    const attackS = Math.max(1, env.attack * sr);
    const decayS = Math.max(1, env.decay * sr);
    const releaseS = Math.max(1, env.release * sr);
    const gain =
      ins.volume *
      voice.velocity *
      (voice.priority > 0 ? this.sfxGain : this.musicGain * this.musicLevel);
    const panL = Math.cos(((ins.pan + 1) / 2) * (Math.PI / 2));
    const panR = Math.sin(((ins.pan + 1) / 2) * (Math.PI / 2));
    const arpSteps = voice.arp;
    const arpLen = arpSteps.length;
    const arpSamples = arpLen ? Math.max(1, Math.round(sr / Math.max(1, ins.arp.rate))) : 0;
    const vib = ins.vibrato;
    const vibDelay = vib.delay * sr;
    const glideStep = ins.glide > 0 ? 1 / Math.max(1, ins.glide * sr) : 0;
    const filterOn = ins.filter.type !== 'off';
    const filterQ = 1 - Math.min(MAX_RESONANCE, Math.max(0, ins.filter.resonance));

    for (let i = 0; i < frames; i++) {
      // envelope
      switch (voice.stage) {
        case Stage.Attack:
          voice.env = Math.min(1, voice.env + 1 / attackS);
          if (voice.env >= 1) {
            voice.stage = Stage.Decay;
          }
          break;
        case Stage.Decay:
          voice.env = Math.max(env.sustain, voice.env - (1 - env.sustain) / decayS);
          if (voice.env <= env.sustain) {
            voice.stage = Stage.Sustain;
          }
          break;
        case Stage.Release:
          voice.env = Math.max(0, voice.env - voice.releaseFrom / releaseS);
          if (voice.env <= SILENCE) {
            voice.active = false;
            voice.stage = Stage.Done;
            return;
          }
          break;
      }
      if (voice.releaseAt >= 0 && voice.stage < Stage.Release && voice.age >= voice.releaseAt) {
        this.release(voice);
      }

      // pitch: glide towards the note, then detune + arpeggio + vibrato on top
      if (glideStep > 0 && voice.curFreq !== voice.freq) {
        const delta = voice.freq - voice.curFreq;
        voice.curFreq = Math.abs(delta) < 0.01 ? voice.freq : voice.curFreq + delta * glideStep;
      } else {
        voice.curFreq = voice.freq;
      }
      let semis = ins.detune;
      if (arpLen) {
        semis += arpSteps[Math.floor(voice.age / arpSamples) % arpLen] ?? 0;
      }
      if (vib.depth > 0 && voice.age > vibDelay) {
        semis += Math.sin((voice.age / sr) * vib.rate * Math.PI * 2) * vib.depth;
      }
      const freq = semis === 0 ? voice.curFreq : voice.curFreq * Math.pow(2, semis / 12);

      // oscillator
      let signal: number;
      switch (ins.osc) {
        case 'square':
          signal = voice.phase < ins.duty ? 1 : -1;
          break;
        case 'sine':
          signal = Math.sin(voice.phase * Math.PI * 2);
          break;
        case 'triangle':
          signal = 1 - 4 * Math.abs(voice.phase - 0.5);
          break;
        case 'saw':
          signal = voice.phase * 2 - 1;
          break;
        case 'noise': {
          // update the LFSR at the note frequency (pitched noise, chip style)
          if (voice.phase < voice.lastNoise) {
            voice.noiseSeed ^= voice.noiseSeed << 13;
            voice.noiseSeed ^= voice.noiseSeed >>> 17;
            voice.noiseSeed ^= voice.noiseSeed << 5;
          }
          voice.lastNoise = voice.phase;
          signal = ((voice.noiseSeed & 0xffff) / 0x8000 - 1) * 0.8;
          break;
        }
        case 'sample': {
          if (!voice.sample) {
            signal = 0;
            break;
          }
          const root = midiToFrequency(ins.sampleRoot ?? C4);
          const idx = Math.floor(voice.samplePos);
          signal = idx < voice.sample.length ? (voice.sample[idx] ?? 0) : 0;
          voice.samplePos += freq / root;
          if (idx >= voice.sample.length && voice.stage < Stage.Release) {
            this.release(voice);
          }
          break;
        }
      }
      voice.phase += freq / sr;
      if (voice.phase >= 1) {
        voice.phase -= Math.floor(voice.phase);
      }

      // filter (Chamberlin SVF)
      if (filterOn) {
        const cutoff = Math.min(
          sr * MAX_CUTOFF_RATIO,
          ins.filter.cutoff * (1 + ins.filter.envAmount * voice.env),
        );
        const filterCoeff = 2 * Math.sin((Math.PI * cutoff) / sr);
        voice.low += filterCoeff * voice.band;
        const high = signal - voice.low - filterQ * voice.band;
        voice.band += filterCoeff * high;
        signal =
          ins.filter.type === 'lp' ? voice.low : ins.filter.type === 'hp' ? high : voice.band;
      }

      const out = signal * voice.env * gain;
      outL[i] = (outL[i] ?? 0) + out * panL;
      outR[i] = (outR[i] ?? 0) + out * panR;
      voice.age++;
    }
  }
}

const softClip = (sample: number): number =>
  sample > 1 ? 1 : sample < -1 ? -1 : sample - (sample * sample * sample) / 3;
