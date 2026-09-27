import { describe, expect, it } from 'vitest';

import { convertMidi, readMidi, writeMidi } from './midi';
import { analyseAudio, scoreImport, scoreNotes, scoreSample, transcribe } from './transcribe';

const RATE = 44100;
const hz = (pitch: number): number => 440 * Math.pow(2, (pitch - 69) / 12);

/** A recording from (pitch, start, length) tones with a harmonic series, like a real instrument. */
function render(
  tones: [number, number, number][],
  seconds: number,
  noise: [number, number][] = [],
): Float32Array {
  const out = new Float32Array(Math.round(seconds * RATE));
  for (const [pitch, start, length] of tones) {
    const from = Math.round(start * RATE),
      to = Math.min(out.length, Math.round((start + length) * RATE));
    for (let i = from; i < to; i++) {
      const t = (i - from) / RATE;
      const envelope = Math.min(1, t / 0.01) * Math.min(1, (to - i) / (0.02 * RATE));
      let v = 0;
      for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * hz(pitch) * h * t) / h;
      out[i] = out[i]! + 0.3 * envelope * v;
    }
  }
  let seed = 7;
  for (const [start, length] of noise) {
    const from = Math.round(start * RATE);
    for (let i = 0; i < length * RATE && from + i < out.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out[from + i] =
        out[from + i]! + 0.8 * ((seed / 0x7fffffff) * 2 - 1) * Math.exp(-i / (0.02 * RATE));
    }
  }
  return out;
}

describe('audio transcription', () => {
  it('recovers a melody, its timing and a sensible tempo', () => {
    const melody: [number, number, number][] = [
      [60, 0.1, 0.45],
      [64, 0.6, 0.45],
      [67, 1.1, 0.45],
      [72, 1.6, 0.45],
    ];
    const result = transcribe([render(melody, 2.3)], RATE, { voices: 1, drums: false });
    const notes = result.midi.tracks[0]!.notes;
    expect(notes.map((n) => n.pitch)).toEqual([60, 64, 67, 72]);
    notes.forEach((note, i) => {
      expect(Math.abs(note.start - melody[i]![1])).toBeLessThan(0.03);
      expect(Math.abs(note.end - (melody[i]![1] + melody[i]![2]))).toBeLessThan(0.08);
    });
    expect(Math.abs(result.midi.bpm - 120)).toBeLessThanOrEqual(2);
    expect(result.quality.fidelity).toBeGreaterThan(75);
  });

  it('does not hear the neighbouring semitones of an attack', () => {
    const notes = transcribe(
      [
        render(
          [
            [60, 0.1, 0.4],
            [64, 0.6, 0.4],
          ],
          1.2,
        ),
      ],
      RATE,
      { voices: 4 },
    ).midi.tracks[0]!.notes;
    expect(notes.map((n) => n.pitch)).toEqual([60, 64]);
  });

  it('does not hear the clicks of notes that start and stop abruptly', () => {
    const tone = new Float32Array(RATE * 2);
    for (const [pitch, start] of [
      [60, 0.1],
      [67, 0.6],
      [64, 1.1],
    ] as const) {
      const f = 440 * 2 ** ((pitch - 69) / 12);
      for (let i = 0; i < RATE * 0.4; i++)
        tone[Math.round(start * RATE) + i] = 0.5 * Math.sin((2 * Math.PI * f * i) / RATE);
    }
    const notes = transcribe([tone], RATE, { voices: 2, drums: false }).midi.tracks[0]!.notes;
    expect(notes.map((n) => n.pitch)).toEqual([60, 67, 64]);
    // The click is where the note starts and stops.
    notes.forEach((n, i) => {
      expect(n.start).toBeCloseTo(0.1 + 0.5 * i, 1);
      expect(n.end).toBeCloseTo(0.5 + 0.5 * i, 1);
    });
  });

  it('measures what has nothing to transcribe', () => {
    const silence = new Float32Array(RATE / 2);
    expect(() => transcribe([silence], RATE)).toThrow();
    expect(analyseAudio([silence], RATE).duration).toBeCloseTo(0.5, 1);
    const blip = render([[84, 0, 0.04]], 0.2);
    expect(scoreSample(analyseAudio([blip], RATE), 0.2).fidelity).toBeGreaterThan(90);
  });

  it('hears the three notes of a chord', () => {
    const chord: [number, number, number][] = [
      [60, 0.1, 1],
      [64, 0.1, 1],
      [67, 0.1, 1],
    ];
    const pitches = new Set(
      transcribe([render(chord, 1.3)], RATE, { voices: 3, drums: false }).midi.tracks[0]!.notes.map(
        (n) => n.pitch,
      ),
    );
    expect([...pitches].sort()).toEqual([60, 64, 67]);
  });

  it('follows a two-voice chord progression without inventing notes', () => {
    const chords = [
      [60, 64],
      [62, 65],
      [64, 67],
      [65, 69],
      [67, 71],
      [69, 72],
      [71, 74],
      [72, 76],
    ];
    const tones = chords.flatMap((pair, c) =>
      pair.map((p): [number, number, number] => [p, 0.1 + c * 0.6, 0.5]),
    );
    const notes = transcribe([render(tones, 5)], RATE, { voices: 4, drums: false }).midi.tracks[0]!
      .notes;
    const expected = new Set(
      tones.map(([p, start]) => `${String(Math.round((start - 0.1) / 0.6))}:${String(p)}`),
    );
    expect(notes).toHaveLength(16);
    expect(
      notes.every((n) =>
        expected.has(`${String(Math.round((n.start - 0.1) / 0.6))}:${String(n.pitch)}`),
      ),
    ).toBe(true);
  });

  it('keeps every note of a fast run, however short each one is', () => {
    // Sixteen sixteenths: a tempo-derived minimum length drops most of these, because the long
    // window blurs a real sixteenth down into the same range as the junk it is meant to remove.
    for (const bpm of [120, 140, 150, 180]) {
      const step = 15 / bpm;
      const pitches = [60, 64, 67, 72];
      const tones: [number, number, number][] = Array.from({ length: 16 }, (_, i) => [
        pitches[i % 4]!,
        0.1 + i * step,
        step,
      ]);
      const heard = transcribe([render(tones, 16 * step + 0.4)], RATE, {
        voices: 1,
        drums: false,
      }).midi.tracks[0]!.notes;
      // Every real note survives, in order, on its own beat. Extra blur beside a note is a
      // separate question, covered by the semitone test below.
      const matched = tones.every(([pitch, start]) =>
        heard.some((n) => n.pitch === pitch && Math.abs(n.start - start) < 0.03),
      );
      expect(matched, `${String(bpm)} bpm`).toBe(true);
    }
  });

  it('drops a short note that stands alone, and keeps short notes in a run', () => {
    // A 40 ms blip in the silence is the window's own smear, not a note: it goes.
    const alone = transcribe([render([[60, 0.1, 0.45]], 0.9)], RATE, { voices: 1, drums: false });
    expect(alone.midi.tracks[0]!.notes).toHaveLength(1);
    // The same length, next to another note, is a real fast note: it stays. This is the case a
    // minimum-length rule gets wrong in both directions at once.
    const step = 0.1;
    const inRun = transcribe(
      [
        render(
          [
            [60, 0.1, 0.08],
            [64, 0.1 + step, 0.08],
            [67, 0.1 + 2 * step, 0.08],
          ],
          0.6,
        ),
      ],
      RATE,
      { voices: 1, drums: false },
    );
    const heard = inRun.midi.tracks[0]!.notes;
    for (const [pitch, start] of [
      [60, 0.1],
      [64, 0.2],
      [67, 0.3],
    ] as const)
      expect(heard.some((n) => n.pitch === pitch && Math.abs(n.start - start) < 0.03)).toBe(true);
  });

  it('puts noisy hits on a drum track', () => {
    const hits: [number, number][] = [0.2, 0.7, 1.2, 1.7].map((t) => [t, 0.15]);
    const result = transcribe([render([], 2.2, hits)], RATE, { drums: true });
    const drums = result.midi.tracks.find((t) => t.percussion)!;
    expect(drums.notes.length).toBeGreaterThanOrEqual(3);
    expect(drums.notes.every((n) => n.channel === 9)).toBe(true);
  });

  it('scores wrong notes below right ones, and the chip conversion on the same scale', () => {
    const melody: [number, number, number][] = [
      [60, 0.1, 0.45],
      [64, 0.6, 0.45],
      [67, 1.1, 0.45],
    ];
    const { analysis, midi } = transcribe([render(melody, 1.8)], RATE, { voices: 1, drums: false });
    const right = scoreNotes(
      analysis,
      melody.map(([pitch, start, length]) => ({
        pitch,
        start,
        end: start + length,
        velocity: 100,
        drum: false,
      })),
    );
    const wrong = scoreNotes(
      analysis,
      melody.map(([pitch, start, length]) => ({
        pitch: pitch + 1,
        start: start + 0.2,
        end: start + length,
        velocity: 100,
        drum: false,
      })),
    );
    expect(right.fidelity).toBeGreaterThan(wrong.fidelity + 30);
    const converted = scoreImport(analysis, convertMidi(midi, { prefix: 'p', voices: 4 }));
    expect(converted.fidelity).toBeGreaterThan(60);
    expect(converted.loss).toBe(100 - converted.fidelity);
  });

  it('says how much of a long sound a one-second sample keeps', () => {
    const { analysis } = transcribe([render([[69, 0, 2]], 2)], RATE, { voices: 1 });
    const kept = scoreSample(analysis, 1);
    expect(kept.fidelity).toBeGreaterThan(40);
    expect(kept.fidelity).toBeLessThan(60);
  });

  it('refuses silence', () => {
    expect(() => transcribe([new Float32Array(RATE)], RATE)).toThrow();
  });
});

describe('MIDI export', () => {
  it('round-trips through the importer', () => {
    const { midi } = transcribe(
      [
        render(
          [
            [60, 0.1, 0.4],
            [67, 0.6, 0.4],
          ],
          1.2,
        ),
      ],
      RATE,
      { voices: 1, drums: false },
    );
    const back = readMidi(writeMidi(midi));
    const notes = back.tracks.flatMap((t) => t.notes);
    expect(notes.map((n) => n.pitch)).toEqual(
      midi.tracks.flatMap((t) => t.notes.map((n) => n.pitch)),
    );
    expect(Math.round(back.bpm)).toBe(midi.bpm);
    expect(Math.abs(notes[0]!.start - midi.tracks[0]!.notes[0]!.start)).toBeLessThan(0.01);
  });
});
