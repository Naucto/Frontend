import { describe, expect, it } from 'vitest';

import type { MidiNote, ParsedMidi } from './midi';
import { midiToSong, shareVoices } from './midi-song';
import { VOICES } from './model';
import { voicePlan } from './timeline';

/** A note `beats` long at `beat`, at 120 BPM (half a second a beat). */
const note = (pitch: number, beat: number, beats = 1): MidiNote => ({
  start: beat / 2,
  end: (beat + beats) / 2,
  pitch,
  velocity: 100,
  channel: 0,
});

/** A melody playing the same bar eight times over, and a bass of two-note chords under it. */
function tune(): ParsedMidi {
  const melody = Array.from({ length: 32 }, (_, beat) => note(72 + (beat % 4), beat));
  const bass = Array.from({ length: 8 }, (_, bar) => [
    note(36, bar * 4, 4),
    note(43, bar * 4, 4),
  ]).flat();
  return {
    tracks: [
      { index: 0, name: 'lead', notes: melody, channels: [0], program: 80, percussion: false },
      { index: 1, name: 'bass', notes: bass, channels: [1], program: 33, percussion: false },
    ],
    bpm: 120,
    tempoChanges: 0,
    sustained: 0,
    warnings: [],
    duration: 16,
  };
}

describe('a MIDI file as a music', () => {
  it('makes a track of each file track, with its own instrument and patterns', () => {
    const { song, patterns, instruments } = midiToSong(tune(), {
      name: 'theme',
      tracks: [0, 1],
      sfxVoices: 1,
      firstSlot: 3,
      prefix: 'imp',
    });
    expect(song.tracks).toEqual(['lead', 'bass']);
    expect(patterns.map((pattern) => pattern.name)).toEqual(['lead 1', 'bass 1']);
    expect(instruments).toHaveLength(2);
    expect(new Set(song.blocks.map((block) => block.track))).toEqual(new Set([0, 1]));
    expect(patterns.map((pattern) => pattern.slot)).toEqual(patterns.map((_, i) => 3 + i));
    for (const block of song.blocks) {
      const pattern = patterns.find((held) => held.id === block.pattern);
      expect(pattern?.notes.every((note) => note.instrument === instruments[block.track]?.id)).toBe(
        true,
      );
    }
  });

  it('stores a repeated section once and plays it again', () => {
    const { song, patterns } = midiToSong(tune(), {
      name: 'theme',
      tracks: [0],
      sfxVoices: 1,
      firstSlot: 0,
      prefix: 'imp',
    });
    expect(patterns).toHaveLength(1);
    expect(song.blocks).toHaveLength(1);
    expect(song.blocks[0]?.start).toBe(0);
    expect((song.blocks[0]?.repeat ?? 0) * (patterns[0]?.steps ?? 0)).toBe(128);
  });

  it('gives the chords the voices they need, and keeps the ones asked for the sound effects', () => {
    expect(shareVoices([1, 2], 1)).toEqual([1, 2]);
    expect(shareVoices([3, 3], 1)).toEqual([3, 1]);
    const parsed = tune();
    const imported = midiToSong(parsed, {
      name: 'theme',
      tracks: [0, 1],
      sfxVoices: 1,
      firstSlot: 0,
      prefix: 'imp',
    });
    const plan = voicePlan(
      imported.song,
      new Map(imported.patterns.map((pattern) => [pattern.id, pattern])),
      new Map(imported.instruments.map((instrument) => [instrument.id, instrument])),
    );
    expect(plan.tracks.map((voices) => voices.length)).toEqual([1, 2]);
    // A melody played legato needs one voice, which takes each note as the last one ends.
    expect(imported.reports.map((report) => report.droppedNotes)).toEqual([0, 0]);
    expect(plan.tracks.flat().length).toBeLessThanOrEqual(VOICES - 1);
  });

  it('refuses more tracks than there are voices to play them', () => {
    expect(() =>
      midiToSong(tune(), {
        name: 'x',
        tracks: [0, 1, 0, 1, 0],
        sfxVoices: 1,
        firstSlot: 0,
        prefix: 'i',
      }),
    ).toThrow();
  });
});
