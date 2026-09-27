import { describe, expect, it } from 'vitest';

import { convertMidi, drumPitch, readMidi } from './midi';

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
