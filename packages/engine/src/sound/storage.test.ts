import { describe, expect, it } from 'vitest';

import { defaultPattern, defaultSong, type Pattern, type Song } from './model';
import {
  blockIds,
  decodePattern,
  decodeSfx,
  decodeSong,
  encodePattern,
  encodeSfx,
  encodeSong,
} from './storage';

const pattern: Pattern = {
  ...defaultPattern('p1', 3, 'verse'),
  colour: 6,
  notes: [
    { step: 0, pitch: 60, length: 2, instrument: 'lead', volume: 1 },
    { step: 2.5, pitch: 64, length: 0.5, instrument: 'bass', volume: 0.6 },
  ],
};

const song: Song = {
  ...defaultSong(140),
  name: 'boss',
  loopEnd: 6,
  blocks: [
    { id: 'a1b2', pattern: 'p1', start: 0, repeat: 1, track: 0 },
    { id: 'c3d4', pattern: 'p1', start: 2, repeat: 3, track: 0 },
  ],
};

describe('sound storage', () => {
  it('writes notes and blocks as arrays, leaving out a volume or a repeat of 1', () => {
    expect(JSON.parse(encodePattern(pattern)).notes).toEqual([
      [0, 60, 2, 'lead'],
      [2.5, 64, 0.5, 'bass', 0.6],
    ]);
    expect(JSON.parse(encodeSong(song)).blocks).toEqual([
      ['a1b2', 'p1', 0],
      ['c3d4', 'p1', 2, 3],
    ]);
  });

  it('reads back what it wrote', () => {
    expect(decodePattern(JSON.parse(encodePattern(pattern)))).toEqual(pattern);
    expect(decodeSong(JSON.parse(encodeSong(song)))).toEqual(song);
    const sfx = {
      name: 'jump',
      bpm: 200,
      stepsPerBeat: 4 as const,
      steps: 8,
      notes: pattern.notes,
    };
    expect(decodeSfx(JSON.parse(encodeSfx(sfx)))).toEqual(sfx);
  });

  it('still reads notes and blocks written as objects', () => {
    expect(decodePattern(JSON.parse(JSON.stringify(pattern)))).toEqual(pattern);
    expect(decodeSong(JSON.parse(JSON.stringify(song)))).toEqual(song);
  });

  it('keeps a music of 48 blocks and a pattern of 32 notes small', () => {
    const big: Song = {
      ...song,
      blocks: Array.from({ length: 48 }, (_, k) => ({
        id: blockIds(song)(),
        pattern: 'p0000001',
        start: k * 2,
        repeat: 1,
        track: 0,
      })),
    };
    const long: Pattern = {
      ...pattern,
      notes: Array.from({ length: 32 }, (_, k) => ({
        step: k,
        pitch: 60 + (k % 12),
        length: 1,
        instrument: 'i0000001',
        volume: 1,
      })),
    };
    expect(encodeSong(big).length / 48).toBeLessThan(30);
    expect(encodePattern(long).length / 32).toBeLessThan(30);
  });

  it('makes short block ids no other block of the music has', () => {
    let roll = 0;
    const next = blockIds(song, () => [0, 0, 0.5][roll++ % 3] ?? 0);
    const first = next();
    const second = next();
    expect(first).toHaveLength(4);
    expect(second).not.toBe(first);
    expect(['a1b2', 'c3d4']).not.toContain(first);
  });
});
