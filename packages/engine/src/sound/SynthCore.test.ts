import { describe, expect, it } from 'vitest';

import { defaultInstrument, defaultPattern, SUBSTEPS } from './model';
import { Sequencer } from './Sequencer';
import { SynthCore } from './SynthCore';

const SR = 48000;

const render = (synth: SynthCore, seconds: number): Float32Array => {
  const frames = Math.round(seconds * SR);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  synth.render(left, right, frames);
  return left;
};

const zeroCrossings = (buf: Float32Array): number => {
  let count = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i - 1] ?? 0) < 0 && (buf[i] ?? 0) >= 0) {
      count++;
    }
  }
  return count;
};

describe('SynthCore', () => {
  it('plays a square wave at the requested pitch', () => {
    const synth = new SynthCore(SR);
    const ins = defaultInstrument('i', 'lead');
    ins.env = { attack: 0, decay: 0, sustain: 1, release: 0.01 };
    synth.noteOn(ins, 69, 1, 0); // A4 = 440 Hz
    const buf = render(synth, 1);
    expect(zeroCrossings(buf)).toBeGreaterThan(430);
    expect(zeroCrossings(buf)).toBeLessThan(450);
  });

  it('detunes the oscillator by whole and fractional semitones', () => {
    const synth = new SynthCore(SR);
    const ins = defaultInstrument('i');
    ins.env = { attack: 0, decay: 0, sustain: 1, release: 0.01 };
    ins.detune = 12; // one octave up
    synth.noteOn(ins, 69, 1, 0); // A4 + 12 = A5 = 880 Hz
    const buf = render(synth, 1);
    expect(zeroCrossings(buf)).toBeGreaterThan(860);
    expect(zeroCrossings(buf)).toBeLessThan(900);
  });

  it('glides from the sounding pitch into the new note', () => {
    const hzOver = (synth: SynthCore, seconds: number): number =>
      zeroCrossings(render(synth, seconds)) / seconds;
    const gliding = new SynthCore(SR);
    const ins = defaultInstrument('i');
    ins.env = { attack: 0, decay: 0, sustain: 1, release: 0.01 };
    ins.glide = 0.5;
    gliding.noteOn(ins, 57, 1, 0, 0); // A3 = 220 Hz
    render(gliding, 0.2);
    gliding.noteOn(ins, 69, 1, 0, 0); // slide up towards A4 = 440 Hz
    const first = hzOver(gliding, 0.25);
    const second = hzOver(gliding, 0.25);
    expect(first).toBeGreaterThan(230); // moved off the old note
    expect(first).toBeLessThan(430); // but has not arrived
    expect(second).toBeGreaterThan(first); // still climbing

    // Without glide the same retrigger lands on the new pitch immediately.
    const instant = new SynthCore(SR);
    const plain = defaultInstrument('j');
    plain.env = ins.env;
    instant.noteOn(plain, 57, 1, 0, 0);
    render(instant, 0.2);
    instant.noteOn(plain, 69, 1, 0, 0);
    expect(hzOver(instant, 0.25)).toBeGreaterThan(430);
  });

  it('follows the envelope and releases after the note length', () => {
    const synth = new SynthCore(SR);
    const ins = defaultInstrument('i');
    ins.osc = 'sine';
    ins.env = { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.1 };
    synth.noteOn(ins, 60, 1, 0.3);
    const buf = render(synth, 0.6);
    const peak = (from: number, to: number): number => {
      let peakValue = 0;
      for (let i = Math.round(from * SR); i < Math.round(to * SR); i++) {
        peakValue = Math.max(peakValue, Math.abs(buf[i] ?? 0));
      }
      return peakValue;
    };
    expect(peak(0, 0.02)).toBeLessThan(peak(0.08, 0.1));
    expect(peak(0.25, 0.3)).toBeLessThan(peak(0.08, 0.1));
    expect(peak(0.5, 0.6)).toBe(0);
    expect(synth.isPlaying(0)).toBe(false);
  });

  /** What a held keyboard key asks for: no length, so the note waits at its sustain level. */
  it('holds a note of no length until the channel is let go', () => {
    const synth = new SynthCore(SR);
    const ins = defaultInstrument('i');
    ins.osc = 'sine';
    ins.env = { attack: 0.01, decay: 0.05, sustain: 0.5, release: 0.05 };
    synth.noteOn(ins, 60, 1, 0, 3);
    const held = render(synth, 2);
    const peak = (buf: Float32Array, from: number, to: number): number => {
      let peakValue = 0;
      for (let i = Math.round(from * SR); i < Math.round(to * SR); i++) {
        peakValue = Math.max(peakValue, Math.abs(buf[i] ?? 0));
      }
      return peakValue;
    };
    // Two seconds in, long past attack, decay and release put together.
    expect(peak(held, 1.9, 2)).toBeGreaterThan(0);
    expect(synth.isPlaying(3)).toBe(true);

    synth.noteOff(3);
    const after = render(synth, 0.2);
    expect(peak(after, 0.15, 0.2)).toBe(0);
    expect(synth.isPlaying(3)).toBe(false);
  });

  it('steals the oldest lowest-priority voice when full', () => {
    const synth = new SynthCore(SR);
    const ins = defaultInstrument('i');
    for (let i = 0; i < 5; i++) {
      synth.noteOn(ins, 60 + i, 1, 0, undefined, 0);
    }
    render(synth, 0.01);
    const stolen = synth.noteOn(ins, 80, 1, 0, undefined, 1);
    expect(stolen).toBe(0);
    expect(synth.voices[0]?.pitch).toBe(80);
  });

  it('keeps a releasing voice the oldest, so it is stolen first', () => {
    const synth = new SynthCore(SR);
    const ins = defaultInstrument('i');
    ins.env = { attack: 0, decay: 0, sustain: 1, release: 1 };
    synth.noteOn(ins, 60, 1, 0);
    render(synth, 0.01);
    for (let i = 1; i < 5; i++) {
      synth.noteOn(ins, 60 + i, 1, 0);
    }
    render(synth, 0.01);
    synth.noteOff(0);
    render(synth, 0.01);
    expect(synth.noteOn(ins, 80, 1, 0)).toBe(0);
  });

  it('releases a sample that has run out over the release time', () => {
    const synth = new SynthCore(SR);
    synth.samples.set('s', new Float32Array(10).fill(0.5));
    const ins = defaultInstrument('i');
    ins.osc = 'sample';
    ins.sampleId = 's';
    ins.env = { attack: 0, decay: 0, sustain: 1, release: 0.1 };
    synth.noteOn(ins, ins.sampleRoot ?? 60, 1, 0);
    render(synth, 0.15);
    expect(synth.isPlaying(0)).toBe(false);
  });

  it('never lets a music note steal a sound effect voice', () => {
    const synth = new SynthCore(SR);
    const ins = defaultInstrument('i');
    for (let i = 0; i < 5; i++) {
      synth.noteOn(ins, 60 + i, 1, 0, undefined, 1);
    }
    render(synth, 0.01);
    expect(synth.noteOn(ins, 80, 1, 0, undefined, 0)).toBe(-1);
    expect(synth.voices.map((voice) => voice.pitch)).toEqual([60, 61, 62, 63, 64]);
  });
});

describe('Sequencer', () => {
  it('triggers notes at step boundaries and loops', () => {
    const synth = new SynthCore(SR);
    const seq = new Sequencer(synth, SR);
    const ins = defaultInstrument('i');
    const pattern = defaultPattern('p0');
    pattern.bpm = 120;
    pattern.stepsPerBeat = 4;
    pattern.steps = 4;
    pattern.notes = [
      { step: 0, pitch: 60, length: 1, instrument: 'i', volume: 1 },
      { step: 2, pitch: 64, length: 1, instrument: 'i', volume: 1 },
    ];
    seq.setLibrary(new Map([['i', ins]]), new Map([['p0', pattern]]));
    seq.playSong({ name: 's', sequence: ['p0'], loop: true, loopStart: 0 }, true, 0);
    const stepSamples = Math.round((60 / 120 / 4) * SR);
    seq.advance(1);
    expect(synth.voices.filter((voice) => voice.active).map((voice) => voice.pitch)).toEqual([60]);
    seq.advance(stepSamples * 2);
    expect(
      synth.voices
        .filter((voice) => voice.active)
        .map((voice) => voice.pitch)
        .sort(),
    ).toEqual([60, 64]);
    // Sub-step 16 fired the note on step 2 and the next one is not due yet, so that is the one
    // sounding, however far the counter has moved past it.
    expect(seq.position()).toEqual({ pattern: 0, step: 16 / SUBSTEPS });
    seq.advance(stepSamples * 2);
    expect(seq.position()?.step).toBe(0);
    seq.stopMusic(0);
    expect(seq.position()).toBeNull();
  });

  it('stops a music at the first empty place, and plays past a pattern that is gone', () => {
    const build = (sequence: (string | null)[]): { synth: SynthCore; seq: Sequencer } => {
      const synth = new SynthCore(SR);
      const seq = new Sequencer(synth, SR);
      const ins = defaultInstrument('i');
      const first = defaultPattern('p0');
      const third = defaultPattern('p2');
      for (const pattern of [first, third]) {
        pattern.bpm = 120;
        pattern.stepsPerBeat = 4;
        pattern.steps = 1;
        pattern.notes = [{ step: 0, pitch: 60, length: 1, instrument: 'i', volume: 1 }];
      }
      third.notes = [{ step: 0, pitch: 72, length: 1, instrument: 'i', volume: 1 }];
      seq.setLibrary(
        new Map([['i', ins]]),
        new Map([
          ['p0', first],
          ['p2', third],
        ]),
      );
      seq.playSong({ name: 's', sequence, loop: false, loopStart: 0 }, false, 0);
      return { synth, seq };
    };
    const stepSamples = Math.round((60 / 120 / 4) * SR);

    const hole = build(['p0', null, 'p2']);
    hole.seq.advance(stepSamples * 2);
    expect(hole.seq.position()).toBeNull();
    expect(hole.synth.voices.some((voice) => voice.active && voice.pitch === 72)).toBe(false);

    // The place was filled; only the pattern it named has since been deleted.
    const orphan = build(['p0', 'gone', 'p2']);
    orphan.seq.advance(stepSamples * 2);
    expect(orphan.synth.voices.some((voice) => voice.active && voice.pitch === 72)).toBe(true);
  });

  it('stops a looping music whose every pattern is gone', () => {
    const synth = new SynthCore(SR);
    const seq = new Sequencer(synth, SR);
    seq.setLibrary(new Map(), new Map());
    seq.playSong({ name: 's', sequence: ['gone', 'also gone'], loop: true, loopStart: 0 }, true, 0);
    seq.advance(128);
    expect(seq.isPlaying).toBe(false);
  });

  it('bends a gliding instrument from the note before into the next one', () => {
    const synth = new SynthCore(SR);
    const seq = new Sequencer(synth, SR);
    const ins = defaultInstrument('i');
    ins.glide = 0.08;
    const pattern = defaultPattern('p0');
    pattern.bpm = 120;
    pattern.stepsPerBeat = 4;
    pattern.steps = 2;
    pattern.notes = [
      { step: 0, pitch: 72, length: 1, instrument: 'i', volume: 1 },
      { step: 1, pitch: 48, length: 1, instrument: 'i', volume: 1 },
    ];
    seq.setLibrary(new Map([['i', ins]]), new Map([['p0', pattern]]));
    seq.playSong({ name: 's', sequence: ['p0'], loop: false, loopStart: 0 }, false, 0);
    const stepSamples = Math.round((60 / 120 / 4) * SR);
    seq.advance(stepSamples + 1);
    synth.render(new Float32Array(64), new Float32Array(64), 64);
    const voice = synth.voices.find((candidate) => candidate.active && candidate.pitch === 48);
    expect(voice?.curFreq).toBeGreaterThan(voice?.freq ?? Infinity);
  });

  /** Unticking LOOP has to reach a take that is already running, not only the next one. */
  it('stops looping when told so mid-take', () => {
    const synth = new SynthCore(SR);
    const seq = new Sequencer(synth, SR);
    const ins = defaultInstrument('i');
    const pattern = defaultPattern('p0');
    pattern.bpm = 120;
    pattern.stepsPerBeat = 4;
    pattern.steps = 1;
    seq.setLibrary(new Map([['i', ins]]), new Map([['p0', pattern]]));
    seq.playSong({ name: 's', sequence: ['p0'], loop: true, loopStart: 0 }, true, 0);
    const stepSamples = Math.round((60 / 120 / 4) * SR);

    seq.advance(stepSamples * 2);
    expect(seq.position()).not.toBeNull();

    seq.setLoop(false);
    seq.advance(stepSamples * 2);
    expect(seq.position()).toBeNull();
  });

  const chord = (): {
    synth: SynthCore;
    seq: Sequencer;
    ins: ReturnType<typeof defaultInstrument>;
  } => {
    const synth = new SynthCore(SR);
    const seq = new Sequencer(synth, SR);
    const ins = defaultInstrument('i');
    const pattern = defaultPattern('p0');
    pattern.bpm = 120;
    pattern.stepsPerBeat = 4;
    pattern.steps = 4;
    pattern.notes = [0, 4, 7].map((semi) => ({
      step: 0,
      pitch: 60 + semi,
      length: 2,
      instrument: 'i',
      volume: 1,
    }));
    seq.setLibrary(new Map([['i', ins]]), new Map([['p0', pattern]]));
    return { synth, seq, ins };
  };

  const play = (seq: Sequencer): void => {
    seq.playSong({ name: 's', sequence: ['p0'], loop: false, loopStart: 0 }, false, 0);
    seq.advance(1);
  };

  it('walks a chord with one voice when the instrument arpeggiates', () => {
    const { synth, seq, ins } = chord();
    ins.arp.rate = 12;
    play(seq);
    const sounding = synth.voices.filter((voice) => voice.active);
    expect(sounding).toHaveLength(1);
    // The lowest note of the chord, with the rest of it as intervals above.
    expect(sounding[0]?.pitch).toBe(60);
  });

  it('holds a chord on a voice each when the instrument does not', () => {
    const { synth, seq } = chord();
    play(seq);
    expect(synth.voices.filter((voice) => voice.active)).toHaveLength(3);
  });

  it('triggers a note that falls between two steps', () => {
    const synth = new SynthCore(SR);
    const seq = new Sequencer(synth, SR);
    const ins = defaultInstrument('i');
    const pattern = defaultPattern('p0');
    pattern.bpm = 120;
    pattern.stepsPerBeat = 4;
    pattern.steps = 4;
    pattern.notes = [{ step: 2.5, pitch: 67, length: 0.5, instrument: 'i', volume: 1 }];
    seq.setLibrary(new Map([['i', ins]]), new Map([['p0', pattern]]));
    seq.playSong({ name: 's', sequence: ['p0'], loop: false, loopStart: 0 }, false, 0);
    const stepSamples = Math.round((60 / 120 / 4) * SR);
    seq.advance(stepSamples * 3);
    expect(synth.voices.filter((voice) => voice.active).map((voice) => voice.pitch)).toEqual([67]);
  });
});
