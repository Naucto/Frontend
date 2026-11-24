import { describe, expect, it } from 'vitest';

import {
  defaultInstrument,
  defaultPattern,
  defaultSong,
  type Instrument,
  type Note,
  type Pattern,
  type Song,
  type SongBlock,
} from './model';
import { Sequencer } from './Sequencer';
import { decodeSong, encodeSong } from './storage';
import { SynthCore } from './SynthCore';
import {
  addTrack,
  moveBlocks,
  notesAtOnce,
  placeBlocks,
  removeTrack,
  setSfxVoices,
  stretchPattern,
  voicePlan,
} from './timeline';

const SR = 8000;

const note = (step: number, pitch: number, length: number, instrument = 'i'): Note => ({
  step,
  pitch,
  length,
  instrument,
  volume: 1,
});

const sheet = (id: string, notes: Note[]): Pattern => ({
  ...defaultPattern(id),
  steps: 16,
  stepsPerBeat: 4,
  notes,
});

/** One note at a time. */
const melody = sheet('melody', [note(0, 60, 2), note(2, 62, 2), note(4, 64, 4)]);
/** A low note held under two short ones: two at once. */
const held = sheet('held', [note(0, 48, 8), note(2, 67, 1), note(5, 69, 1)]);
/** A chord of three. */
const chord = sheet('chord', [note(0, 60, 4), note(0, 64, 4), note(0, 67, 4)]);

const patterns = new Map([
  ['melody', melody],
  ['held', held],
  ['chord', chord],
]);
const lead = defaultInstrument('i');
const instruments = new Map<string, Instrument>([['i', lead]]);

const block = (id: string, pattern: string, start: number, track: number): SongBlock => ({
  id,
  pattern,
  start,
  repeat: 1,
  track,
});

const music = (tracks: number, blocks: SongBlock[] = [], sfxVoices = 0): Song => ({
  ...defaultSong(),
  blocks,
  tracks: Array.from({ length: tracks }, (_, i) => `t${String(i)}`),
  sfxVoices,
});

describe('tracks in storage', () => {
  it('leaves out the one track and an empty reserve, and keeps a split as written', () => {
    const whole = { ...defaultSong(), blocks: [block('a', 'melody', 0, 0)] };
    expect(JSON.parse(encodeSong(whole))).not.toHaveProperty('tracks');
    expect(JSON.parse(encodeSong(whole))).not.toHaveProperty('sfxVoices');
    expect(decodeSong(JSON.parse(encodeSong(whole)))).toEqual(whole);

    const split = music(3, [block('a', 'melody', 0, 0), block('b', 'held', 0, 2)], 1);
    expect(decodeSong(JSON.parse(encodeSong(split)))).toEqual(split);
  });

  it('reads a music without tracks as one, and a block on a missing track on the first', () => {
    expect(decodeSong({ blocks: [['a', 'melody', 0, 1, 3]] })).toMatchObject({
      tracks: [''],
      sfxVoices: 0,
      blocks: [{ id: 'a', track: 0 }],
    });
  });
});

describe('placing on tracks', () => {
  it('replaces only what sits on the same track', () => {
    const song = placeBlocks(
      music(2, [block('a', 'melody', 0, 0), block('b', 'melody', 0, 1)]),
      [block('c', 'melody', 0, 0)],
      patterns,
    );
    expect(song.blocks.map((each) => each.id).sort()).toEqual(['b', 'c']);
  });

  it('moves blocks across tracks together, and no further than the last track', () => {
    const song = moveBlocks(
      music(3, [block('a', 'melody', 0, 0), block('b', 'melody', 1, 1)]),
      new Set(['a', 'b']),
      0,
      patterns,
      5,
    );
    expect(song.blocks.map((each) => [each.id, each.track])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
  });

  it('pushes the blocks after a lengthened pattern on its own track only', () => {
    const song = stretchPattern(
      music(2, [
        block('a', 'melody', 0, 0),
        block('b', 'melody', 1, 0),
        block('c', 'melody', 1, 1),
      ]),
      'melody',
      1,
    );
    expect(song.blocks.map((each) => [each.id, each.start])).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 1],
    ]);
  });
});

describe('the voices a pattern asks for', () => {
  it('counts the notes that sound together', () => {
    expect(notesAtOnce(melody, instruments)).toBe(1);
    expect(notesAtOnce(held, instruments)).toBe(2);
    expect(notesAtOnce(chord, instruments)).toBe(3);
  });

  it('counts a chord an arpeggio walks as one voice', () => {
    const arp = new Map([['i', { ...lead, arp: { rate: 12 } }]]);
    expect(notesAtOnce(chord, arp)).toBe(1);
  });
});

describe('the voice plan', () => {
  it('gives each track what its patterns ask for, the reserve to the sound effects', () => {
    const song = music(2, [block('a', 'held', 0, 0), block('b', 'melody', 0, 1)], 1);
    expect(voicePlan(song, patterns, instruments)).toEqual({
      tracks: [[0, 1], [2]],
      needs: [2, 1],
      free: [3],
      sfx: [4],
    });
  });

  it('gives every track one voice before any gets a second, and says what is short', () => {
    const song = music(
      3,
      [block('a', 'chord', 0, 0), block('b', 'held', 0, 1), block('c', 'held', 0, 2)],
      1,
    );
    const plan = voicePlan(song, patterns, instruments);
    expect(plan.tracks.map((voices) => voices.length)).toEqual([2, 1, 1]);
    expect(plan.needs).toEqual([3, 2, 2]);
    expect(plan.free).toEqual([]);
  });

  it('opens no track and keeps no voice past the five', () => {
    expect(addTrack(music(4, [], 1))).toEqual(music(4, [], 1));
    expect(addTrack(music(4)).tracks).toHaveLength(5);
    expect(setSfxVoices(music(3), 9).sfxVoices).toBe(2);
  });

  it('takes a track out with its blocks', () => {
    const song = removeTrack(
      music(3, [
        block('a', 'melody', 0, 0),
        block('b', 'melody', 0, 1),
        block('c', 'melody', 0, 2),
      ]),
      1,
    );
    expect(song.tracks).toEqual(['t0', 't2']);
    expect(removeTrack({ ...music(2), tracks: ['', ''] }, 1).tracks).toEqual(['']);
    expect(song.blocks.map((each) => [each.id, each.track])).toEqual([
      ['a', 0],
      ['c', 1],
    ]);
  });
});

describe('playing tracks', () => {
  const start = (song: Song): { synth: SynthCore; seq: Sequencer } => {
    const synth = new SynthCore(SR);
    const seq = new Sequencer(synth, SR);
    seq.setLibrary(instruments, patterns);
    seq.playSong(song, false, 0);
    seq.advance(1);
    return { synth, seq };
  };
  const busy = (synth: SynthCore): number[] =>
    synth.voices.flatMap((voice, i) => (voice.active ? [i] : []));

  it('sounds a track on the voices it was given', () => {
    const { synth } = start(music(2, [block('a', 'melody', 0, 0), block('b', 'chord', 0, 1)], 2));
    expect(busy(synth)).toEqual([0, 1, 2]);
  });

  it('cuts a note of a track given less than it asks for, and never one of another track', () => {
    const { synth } = start(music(4, [block('a', 'chord', 0, 0), block('b', 'melody', 0, 1)], 1));
    expect(busy(synth)).toEqual([0, 1]);
  });

  it('plays a sound effect on its reserve, without cutting the music', () => {
    const { synth, seq } = start(music(1, [block('a', 'chord', 0, 0)], 2));
    seq.playSfx(sheet('fx', [note(0, 90, 1)]), 0, 1);
    seq.advance(1);
    expect(synth.voices[3]?.pitch).toBe(90);
    expect(busy(synth)).toEqual([0, 1, 2, 3]);
  });

  it('lets a music nobody split use every voice, as before tracks', () => {
    const { synth } = start({ ...defaultSong(), blocks: [block('a', 'chord', 0, 0)] });
    expect(busy(synth)).toHaveLength(3);
  });
});
