import { describe, expect, it } from 'vitest';

import { defaultPattern, type Note, type Pattern, type Song } from './model';
import {
  duplicateBlocks,
  fittedSteps,
  moveBlocks,
  patternBars,
  placeBlocks,
  setBlockRepeat,
  songEnd,
  songLoopEnd,
  stepsAfterEdit,
  stretchPattern,
} from './timeline';

const patterns = new Map<string, Pattern>([
  ['one', { ...defaultPattern('one'), steps: 16, stepsPerBeat: 4 }],
  ['two', { ...defaultPattern('two'), steps: 32, stepsPerBeat: 4 }],
  ['fast', { ...defaultPattern('fast'), steps: 16, stepsPerBeat: 8 }],
]);

const song = (...blocks: [string, string, number, number?][]): Song => ({
  name: '',
  bpm: 120,
  blocks: blocks.map(([id, pattern, start, repeat]) => ({
    id,
    pattern,
    start,
    repeat: repeat ?? 1,
  })),
  loop: true,
  loopStart: 0,
});

const layout = (value: Song): string[] =>
  [...value.blocks]
    .sort((a, b) => a.start - b.start)
    .map((block) => `${block.id}@${String(block.start)}x${String(block.repeat)}`);

describe('timeline', () => {
  it('measures a pattern in bars from its steps per beat', () => {
    expect(patternBars(patterns.get('one') ?? defaultPattern('x'))).toBe(1);
    expect(patternBars(patterns.get('fast') ?? defaultPattern('x'))).toBe(0.5);
  });

  it('ends a song with its last block and keeps the loop end inside it', () => {
    const value = { ...song(['a', 'two', 1, 2]), loopEnd: 9 };
    expect(songEnd(value, patterns)).toBe(5);
    expect(songLoopEnd(value, patterns)).toBe(5);
    expect(songLoopEnd({ ...value, loopEnd: 3 }, patterns)).toBe(3);
  });

  it('replaces the blocks a placed one lands on', () => {
    const value = song(['a', 'one', 0], ['b', 'one', 1], ['c', 'one', 2]);
    const placed = placeBlocks(
      value,
      [{ id: 'd', pattern: 'one', start: 0.5, repeat: 1 }],
      patterns,
    );
    expect(layout(placed)).toEqual(['d@0.5x1', 'c@2x1']);
  });

  it('moves blocks without going before the start', () => {
    const value = song(['a', 'one', 1], ['b', 'one', 3]);
    expect(layout(moveBlocks(value, new Set(['a', 'b']), -4, patterns))).toEqual([
      'a@0x1',
      'b@2x1',
    ]);
  });

  it('repeats a block over what follows it', () => {
    const value = song(['a', 'one', 0], ['b', 'one', 1]);
    expect(layout(setBlockRepeat(value, 'a', 2, patterns))).toEqual(['a@0x2']);
  });

  it('duplicates a selection right after itself and pushes what follows', () => {
    const value = song(['a', 'one', 0], ['b', 'two', 1], ['c', 'one', 3]);
    let next = 0;
    const { song: out, created } = duplicateBlocks(value, new Set(['a', 'b']), patterns, () => {
      next += 1;
      return `n${String(next)}`;
    });
    expect(created.map((block) => block.id)).toEqual(['n1', 'n2']);
    expect(layout(out)).toEqual(['a@0x1', 'b@1x1', 'n1@3x1', 'n2@4x1', 'c@6x1']);
  });

  it('pushes the blocks after a pattern that got longer, once per repeat', () => {
    const value = song(['a', 'one', 0, 2], ['b', 'two', 2], ['c', 'one', 4]);
    expect(layout(stretchPattern(value, 'one', 0.5))).toEqual(['a@0x2', 'b@3x1', 'c@5x1']);
  });

  it('fits a sheet to its last note, a whole bar at a time, and to one bar when empty', () => {
    const at = (step: number): Note => ({ step, pitch: 60, length: 1, instrument: 'i', volume: 1 });
    expect(fittedSteps(4, [])).toBe(16);
    expect(fittedSteps(4, [at(15)])).toBe(16);
    expect(fittedSteps(4, [at(16)])).toBe(32);
    expect(fittedSteps(4, [at(200)])).toBe(128);
  });

  it('grows and shrinks with its notes while its length is the fitted one, as FL Studio does', () => {
    const at = (step: number): Note => ({ step, pitch: 60, length: 1, instrument: 'i', volume: 1 });
    const sheet = { bpm: 120, stepsPerBeat: 4 as const, steps: 16, notes: [at(0)] };
    const grown = stepsAfterEdit(sheet, [at(0), at(40)]);
    expect(grown).toBe(48);
    expect(stepsAfterEdit({ ...sheet, steps: grown, notes: [at(0), at(40)] }, [at(0)])).toBe(16);
  });

  it('keeps a length set by hand, and only grows past it', () => {
    const at = (step: number): Note => ({ step, pitch: 60, length: 1, instrument: 'i', volume: 1 });
    const sheet = { bpm: 120, stepsPerBeat: 4 as const, steps: 36, notes: [at(0)] };
    expect(stepsAfterEdit(sheet, [])).toBe(36);
    expect(stepsAfterEdit(sheet, [at(0), at(50)])).toBe(64);
  });
});
