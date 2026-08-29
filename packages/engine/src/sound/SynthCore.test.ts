import { describe, expect, it } from 'vitest';

import { defaultInstrument, defaultPattern } from './model';
import { Sequencer } from './Sequencer';
import { SynthCore } from './SynthCore';

const SR = 48000;

const render = (synth: SynthCore, seconds: number): Float32Array => {
  const n = Math.round(seconds * SR);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  synth.render(l, r, n);
  return l;
};

const zeroCrossings = (buf: Float32Array): number => {
  let c = 0;
  for (let i = 1; i < buf.length; i++) if ((buf[i - 1] ?? 0) < 0 && (buf[i] ?? 0) >= 0) c++;
  return c;
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
      let p = 0;
      for (let i = Math.round(from * SR); i < Math.round(to * SR); i++)
        p = Math.max(p, Math.abs(buf[i] ?? 0));
      return p;
    };
    expect(peak(0, 0.02)).toBeLessThan(peak(0.08, 0.1));
    expect(peak(0.25, 0.3)).toBeLessThan(peak(0.08, 0.1));
    expect(peak(0.5, 0.6)).toBe(0);
    expect(synth.isPlaying(0)).toBe(false);
  });

  it('steals the oldest lowest-priority voice when full', () => {
    const synth = new SynthCore(SR);
    const ins = defaultInstrument('i');
    for (let i = 0; i < 5; i++) synth.noteOn(ins, 60 + i, 1, 0, undefined, 0);
    render(synth, 0.01);
    const stolen = synth.noteOn(ins, 80, 1, 0, undefined, 1);
    expect(stolen).toBe(0);
    expect(synth.voices[0]?.pitch).toBe(80);
  });
});

describe('Sequencer', () => {
  it('triggers notes at step boundaries and loops', () => {
    const synth = new SynthCore(SR);
    const seq = new Sequencer(synth, SR);
    const ins = defaultInstrument('i');
    const p = defaultPattern('p0');
    p.bpm = 120;
    p.stepsPerBeat = 4;
    p.steps = 4;
    p.notes = [
      { step: 0, pitch: 60, length: 1, instrument: 'i', volume: 1 },
      { step: 2, pitch: 64, length: 1, instrument: 'i', volume: 1 },
    ];
    seq.setLibrary(new Map([['i', ins]]), new Map([['p0', p]]));
    seq.playSong({ name: 's', sequence: ['p0'], loop: true, loopStart: 0 }, true, 0);
    const stepSamples = Math.round((60 / 120 / 4) * SR);
    seq.advance(1);
    expect(synth.voices.filter((v) => v.active).map((v) => v.pitch)).toEqual([60]);
    seq.advance(stepSamples * 2);
    expect(
      synth.voices
        .filter((v) => v.active)
        .map((v) => v.pitch)
        .sort(),
    ).toEqual([60, 64]);
    expect(seq.position()).toEqual({ pattern: 0, step: 3 });
    seq.advance(stepSamples * 2);
    expect(seq.position()?.step).toBe(1);
    seq.stopMusic(0);
    expect(seq.position()).toBeNull();
  });
});
