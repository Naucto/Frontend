import { describe, expect, it } from 'vitest';

import { defaultInstrument, defaultPattern, defaultSong, type Pattern, type Song } from './model';
import { renderOffline } from './offline';
import { decodeInstrument } from './storage';
import { songInSequence } from './timeline';

const pattern = (id: string, pitch: number): Pattern => ({
  ...defaultPattern(id),
  notes: [{ step: 0, pitch, length: 4, instrument: 'i', volume: 1 }],
});
const patterns = new Map([
  ['a', pattern('a', 60)],
  ['b', pattern('b', 67)],
]);
const library = {
  instruments: new Map([['i', defaultInstrument('i')]]),
  patterns,
  samples: new Map<string, string>(),
};

describe('a sound played without a device', () => {
  it('plays the tracks of a music together, at the tempo of the music', () => {
    const song: Song = {
      ...defaultSong(60),
      tracks: ['lead', 'bass'],
      blocks: [
        { id: '1', pattern: 'a', start: 0, repeat: 1, track: 0 },
        { id: '2', pattern: 'b', start: 0, repeat: 1, track: 1 },
        { id: '3', pattern: 'a', start: 1, repeat: 1, track: 0 },
      ],
    };
    const sound = renderOffline(library, { song }, { rate: 8000 });
    expect(sound.notes.map((note) => [note.pitch, note.start, note.track])).toEqual([
      [60, 0, 0],
      [67, 0, 1],
      [60, 4, 0],
    ]);
    expect(sound.marks).toEqual([4]);
    expect(sound.writtenSeconds).toBe(8);
    expect(sound.mono.some((value) => Math.abs(value) > 0.01)).toBe(true);
    expect(sound.broken).toBe(0);
  });

  it('plays a sheet of notes as a sound effect', () => {
    const sound = renderOffline(library, { sheet: pattern('x', 72) }, { rate: 8000 });
    expect(sound.notes).toHaveLength(1);
    expect(sound.mono.some((value) => Math.abs(value) > 0.01)).toBe(true);
  });
});

describe('a music laid out in sequence', () => {
  it('repeats a block for a pattern played twice in a row', () => {
    const song = songInSequence(['a', 'a', 'b'], patterns, { name: 'x', loop: false });
    expect(song.blocks.map((block) => [block.pattern, block.start, block.repeat])).toEqual([
      ['a', 0, 2],
      ['b', 2, 1],
    ]);
    expect([song.name, song.loop, song.tracks]).toEqual(['x', false, ['']]);
  });
});

describe('an instrument as somebody wrote it', () => {
  it('takes the defaults of a new one for what was left out', () => {
    const made = decodeInstrument({ id: 'z', osc: 'saw', env: { attack: 1 } });
    expect(made).toEqual({
      ...defaultInstrument('z', 'z'),
      osc: 'saw',
      env: { ...defaultInstrument('z').env, attack: 1 },
    });
    expect(decodeInstrument({ osc: 'saw' })).toBeNull();
  });
});
