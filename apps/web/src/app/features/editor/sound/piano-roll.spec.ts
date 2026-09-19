import { describe, expect, it } from 'vitest';

import { grown } from './piano-roll.component';

const placed = { step: 8, length: 1 };

describe('grown', () => {
  it('follows the pointer to the right from the placed cell', () => {
    expect(grown(placed, 11, 1, 32, 'create')).toEqual({ step: 8, length: 4 });
  });

  it('keeps one unit when the pointer stays on the placed cell', () => {
    expect(grown(placed, 8, 1, 32, 'create')).toEqual({ step: 8, length: 1 });
  });

  it('grows to the left from the placed cell, which stays its end', () => {
    expect(grown(placed, 5, 1, 32, 'create')).toEqual({ step: 5, length: 4 });
  });

  it('stops at the start of the pattern and at its end', () => {
    expect(grown(placed, -3, 1, 32, 'create')).toEqual({ step: 0, length: 9 });
    expect(grown(placed, 40, 1, 32, 'create')).toEqual({ step: 8, length: 24 });
  });

  it('works at the finest grain when snapping is off', () => {
    expect(grown({ step: 8, length: 0.25 }, 7.5, 0.25, 32, 'create')).toEqual({
      step: 7.5,
      length: 0.75,
    });
  });

  it('moves only the end from the end handle, never under a unit', () => {
    const note = { step: 4, length: 6 };
    expect(grown(note, 12, 1, 32, 'resize-end')).toEqual({ step: 4, length: 9 });
    expect(grown(note, 2, 1, 32, 'resize-end')).toEqual({ step: 4, length: 1 });
  });

  it('moves only the start from the start handle, never past the end', () => {
    const note = { step: 4, length: 6 };
    expect(grown(note, 2, 1, 32, 'resize-start')).toEqual({ step: 2, length: 8 });
    expect(grown(note, 20, 1, 32, 'resize-start')).toEqual({ step: 9, length: 1 });
  });
});
