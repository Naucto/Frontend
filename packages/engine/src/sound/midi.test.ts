import { describe, expect, it } from 'vitest';

import { convertMidi, drumPitch, type ParsedMidi, readMidi } from './midi';

/** A format-0 file at 96 ticks per beat holding one track of the given events. */
function midi(track: number[], ppq = 96): Uint8Array {
  return Uint8Array.from([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    ppq >> 8,
    ppq & 255,
    77,
    84,
    114,
    107,
    (track.length >> 24) & 255,
    (track.length >> 16) & 255,
    (track.length >> 8) & 255,
    track.length & 255,
    ...track,
  ]);
}
const END = [0, 255, 47, 0];

describe('MIDI import', () => {
  it('turns a quarter note at 120 BPM into four steps', () => {
    const parsed = readMidi(midi([0, 0x90, 60, 100, 96, 0x80, 60, 0, ...END]));
    const result = convertMidi(parsed, { prefix: 'theme', voices: 4 });
    expect(result.patterns[0]?.notes[0]).toMatchObject({ step: 0, length: 4, pitch: 60 });
    expect(result.patterns[0]?.bpm).toBe(120);
  });

  it('keeps timing across a tempo change instead of refusing the file', () => {
    // Beat one at 120 BPM (0.5 s), then 60 BPM: the second note starts at 0.5 s, i.e. step 4.
    const parsed = readMidi(
      midi([
        0,
        255,
        81,
        3,
        0x07,
        0xa1,
        0x20,
        0,
        0x90,
        60,
        100,
        96,
        0x80,
        60,
        0,
        0,
        255,
        81,
        3,
        0x0f,
        0x42,
        0x40,
        0,
        0x90,
        62,
        100,
        96,
        0x80,
        62,
        0,
        ...END,
      ]),
    );
    expect(parsed.tempoChanges).toBe(1);
    const result = convertMidi(parsed, { prefix: 't', voices: 4 });
    const second = result.patterns[0]?.notes.find((n) => n.pitch === 62);
    expect(second?.step).toBe(4);
    expect(second?.length).toBe(8);
    expect(result.report.warnings.join(' ')).toContain('flattened');
  });

  it('bakes the sustain pedal into note lengths', () => {
    const parsed = readMidi(
      midi([0, 0xb0, 64, 127, 0, 0x90, 60, 100, 48, 0x80, 60, 0, 0x81, 0x10, 0xb0, 64, 0, ...END]),
    );
    const result = convertMidi(parsed, { prefix: 's', voices: 4 });
    expect(result.patterns[0]?.notes[0]?.length).toBe(8);
    expect(result.report.sustainedNotes).toBe(1);
  });

  it('maps General MIDI drums onto a noise voice', () => {
    const parsed = readMidi(midi([0, 0x99, 36, 100, 24, 0x89, 36, 0, ...END]));
    expect(parsed.tracks[0]?.percussion).toBe(true);
    const result = convertMidi(parsed, { prefix: 'd', voices: 4 });
    expect(result.instruments[0]?.osc).toBe('noise');
    expect(result.patterns[0]?.notes[0]?.pitch).toBe(drumPitch(36));
    expect(result.report.percussionNotes).toBe(1);
  });

  it('keeps melody and bass when a chord exceeds the voices', () => {
    const chord = [0, 0x90, 48, 90, 0, 0x90, 60, 70, 0, 0x90, 64, 80, 0, 0x90, 72, 100];
    const off = [96, 0x80, 48, 0, 0, 0x80, 60, 0, 0, 0x80, 64, 0, 0, 0x80, 72, 0];
    const parsed = readMidi(midi([...chord, ...off, ...END]));
    const outer = convertMidi(parsed, { prefix: 'c', voices: 2 });
    expect(outer.patterns[0]?.notes.map((n) => n.pitch).sort()).toEqual([48, 72]);
    expect(outer.report.droppedNotes).toBe(2);
    expect(outer.report.peakVoices).toBe(2);
  });

  it('imports only the chosen tracks, with the chosen instrument', () => {
    const parsed = readMidi(midi([0, 0x90, 60, 100, 96, 0x80, 60, 0, ...END]));
    const result = convertMidi(parsed, {
      prefix: 'x',
      voices: 4,
      firstSlot: 5,
      instruments: {
        0: {
          ...convertMidi(parsed, { prefix: 'y', voices: 1 }).instruments[0]!,
          name: 'lead',
          osc: 'triangle',
        },
      },
    });
    expect(result.instruments[0]).toMatchObject({ id: 'x-t0', name: 'lead', osc: 'triangle' });
    expect(result.patterns[0]?.slot).toBe(5);
    expect(() => convertMidi(parsed, { prefix: 'x', voices: 4, tracks: [3] })).toThrow('track');
  });

  it('rejects malformed input', () => {
    expect(() => readMidi(new Uint8Array(4))).toThrow();
    expect(() => readMidi(midi([0, 0x90, 60, 100, ...END]))).toThrow('Unterminated');
  });
});

describe('MIDI import reuses repeated sections', () => {
  /** A parsed file holding one track of notes given as [startStep, pitch, lengthSteps, velocity]. */
  const song = (notes: [number, number, number, number][]): ParsedMidi => ({
    bpm: 120,
    tempoChanges: 0,
    sustained: 0,
    warnings: [],
    duration: 0,
    tracks: [
      {
        index: 0,
        name: 'lead',
        channels: [0],
        program: 0,
        percussion: false,
        notes: notes.map(([step, pitch, length, velocity]) => ({
          start: step * 0.125,
          end: (step + length) * 0.125,
          pitch,
          velocity,
          channel: 0,
        })),
      },
    ],
  });

  /** What the song plays, as absolute [step, pitch, length] triples, from its order list. */
  const played = (result: ReturnType<typeof convertMidi>): string[] => {
    const byId = new Map(result.patterns.map((p) => [p.id, p]));
    let offset = 0;
    const out: string[] = [];
    for (const id of result.song.sequence) {
      const pattern = byId.get(id);
      if (!pattern) throw new Error('order list names a missing pattern');
      for (const n of pattern.notes)
        out.push(`${String(offset + n.step)}:${String(n.pitch)}:${String(n.length)}`);
      offset += pattern.steps;
    }
    return out.sort();
  };

  /** Four notes that fill one 32-step section. */
  const phrase = (at: number, shift = 0): [number, number, number, number][] => [
    [at, 60 + shift, 4, 100],
    [at + 8, 64 + shift, 4, 100],
    [at + 16, 67 + shift, 4, 100],
    [at + 24, 64 + shift, 4, 100],
  ];

  it('stores a phrase said sixteen times once, and names it sixteen times', () => {
    const notes = Array.from({ length: 16 }, (_, i) => phrase(i * 32)).flat();
    const result = convertMidi(song(notes), { prefix: 't', voices: 4 });
    expect(result.song.sequence).toHaveLength(16);
    expect(result.patterns.length).toBeLessThanOrEqual(2);
    expect(result.report.reusedSections).toBe(16 - result.patterns.length);
    expect(result.report.importedNotes).toBe(64);
  });

  it('plays exactly the notes it was given, repeats and all', () => {
    const notes = [...phrase(0), ...phrase(32), ...phrase(64, 5), ...phrase(96), ...phrase(128, 5)];
    const result = convertMidi(song(notes), { prefix: 't', voices: 4 });
    const expected = notes
      .map(([step, pitch, length]) => `${String(step)}:${String(pitch)}:${String(length)}`)
      .sort();
    expect(played(result)).toEqual(expected);
    expect(result.patterns.length).toBeLessThan(result.song.sequence.length);
  });

  it('finds the repeat in a performance whose velocities never match exactly', () => {
    const notes = Array.from({ length: 8 }, (_, i) =>
      phrase(i * 32).map(([s, p, l, v], j): [number, number, number, number] => [
        s,
        p,
        l,
        v - ((i + j) % 3),
      ]),
    ).flat();
    const result = convertMidi(song(notes), { prefix: 't', voices: 4 });
    expect(result.patterns.length).toBeLessThan(4);
  });

  it('picks the section length that stores the least: one bar repeated needs a short pattern', () => {
    // A one-bar (16 step) figure repeated, with a different bar after every fourth so that two
    // bars never repeat as a pair but single bars do.
    const bar = (at: number, shift: number): [number, number, number, number][] => [
      [at, 60 + shift, 4, 100],
      [at + 8, 64 + shift, 4, 100],
    ];
    const notes = Array.from({ length: 12 }, (_, i) => bar(i * 16, i % 4 === 3 ? 7 : 0)).flat();
    const result = convertMidi(song(notes), { prefix: 't', voices: 4 });
    expect(result.report.patternSteps).toBe(16);
    expect(result.patterns).toHaveLength(2);
    expect(result.song.sequence).toHaveLength(12);
  });

  it('stores every section when none of them repeats', () => {
    const notes = Array.from(
      { length: 6 },
      (_, i) => [i * 32, 50 + i * 3, 4, 100] as [number, number, number, number],
    );
    const result = convertMidi(song(notes), { prefix: 't', voices: 4 });
    expect(result.patterns).toHaveLength(result.song.sequence.length);
    expect(result.report.reusedSections).toBe(0);
    expect(result.report.importedNotes).toBe(6);
  });
});

describe('MIDI import of music played by hand', () => {
  const NOTE = (pitch: number, wait: number, hold: number): number[] => [
    ...vlq(wait),
    0x90,
    pitch,
    100,
    ...vlq(hold),
    0x80,
    pitch,
    0,
  ];
  function vlq(value: number): number[] {
    const out = [value & 127];
    for (let v = value >> 7; v; v >>= 7) out.unshift((v & 127) | 128);
    return out;
  }
  const TEMPO = (us: number, wait: number): number[] => [
    ...vlq(wait),
    255,
    81,
    3,
    (us >> 16) & 255,
    (us >> 8) & 255,
    us & 255,
  ];

  it('evens out a wavering pulse, so the same bar is the same length every time', () => {
    // A bar of four quarter notes said six times while the tempo wanders between 115 and 128 BPM
    // every beat. Timed in seconds the bars drift and none repeats; placed by beat they all do.
    const track: number[] = [];
    let beat = 0;
    for (let bar = 0; bar < 6; bar++)
      for (const pitch of [60, 64, 67, 64]) {
        track.push(...TEMPO(beat % 2 ? 470000 : 520000, beat === 0 ? 0 : 0));
        track.push(...NOTE(pitch, 0, 80));
        track.push(...vlq(16), 0xff, 0x01, 0); // pad the beat out to 96 ticks
        beat++;
      }
    const parsed = readMidi(midi([...track, ...END]));
    expect(parsed.tempoChanges).toBeGreaterThan(8);
    expect(parsed.steadyBpm).toBeGreaterThan(110);
    expect(parsed.steadyBpm).toBeLessThan(130);
    const result = convertMidi(parsed, { prefix: 't', voices: 4 });
    expect(result.patterns.length).toBeLessThan(result.song.sequence.length);
    expect(result.report.warnings.join(' ')).toContain('evened out');
  });

  it('keeps a score with a few written tempo changes timed in seconds', () => {
    const track = [
      ...TEMPO(500000, 0),
      ...NOTE(60, 0, 96),
      ...TEMPO(1000000, 0),
      ...NOTE(62, 0, 96),
      ...END,
    ];
    const parsed = readMidi(midi(track));
    expect(parsed.steadyBpm).toBeUndefined();
  });

  it('snaps loose timing to whole steps when that is what makes the repeats match', () => {
    const jitter = (i: number): number => [0.06, -0.09, 0.12, -0.04, 0.08][i % 5] ?? 0;
    const notes: [number, number, number, number][] = [];
    for (let bar = 0; bar < 12; bar++)
      [0, 4, 8, 12].forEach((at, j) =>
        notes.push([bar * 16 + at + jitter(bar + j), 60 + j * 2, 3.9 + jitter(bar), 100]),
      );
    const parsed: ParsedMidi = {
      bpm: 120,
      tempoChanges: 0,
      sustained: 0,
      warnings: [],
      duration: 0,
      tracks: [
        {
          index: 0,
          name: 'lead',
          channels: [0],
          program: 0,
          percussion: false,
          notes: notes.map(([step, pitch, length, velocity]) => ({
            start: step * 0.125,
            end: (step + length) * 0.125,
            pitch,
            velocity,
            channel: 0,
          })),
        },
      ],
    };
    const result = convertMidi(parsed, { prefix: 't', voices: 4 });
    expect(result.report.timingGrid).toBeGreaterThanOrEqual(0.5);
    expect(result.patterns.length).toBeLessThanOrEqual(2);
    expect(result.song.sequence.length).toBeGreaterThanOrEqual(6);
  });
});
