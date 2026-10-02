import { describe, expect, it } from 'vitest';

import { changedLineHunks } from './ai';

// The blocks the code review offers, as lines of the new text counted from zero, end exclusive —
// the shape the Backend takes. Its walk is the same one, so these must agree with what it applies.
describe('changedLineHunks', () => {
  it.each([
    ['an inserted line', 'a\nc', 'a\nb\nc', [{ from: 1, to: 2 }]],
    // Every case from here was an empty range before: the walk stopped once one side ran out, which
    // for anything but a pure insertion left the new lines behind.
    ['one line replaced', 'a\nX\nc', 'a\nY\nc', [{ from: 1, to: 2 }]],
    ['the last line replaced', 'a\nb\nX', 'a\nb\nY', [{ from: 2, to: 3 }]],
    ['one line replaced by two', 'a\nX\nc', 'a\nY\nZ\nc', [{ from: 1, to: 3 }]],
    // A deletion has no new lines, so its block is empty and sits where the lines were.
    ['a deleted line', 'a\nX\nc', 'a\nc', [{ from: 1, to: 1 }]],
    [
      'two separate edits',
      'one\nA\ntwo\nthree\nB\nfour',
      'one\nA2\ntwo\nthree\nB2\nfour',
      [
        { from: 1, to: 2 },
        { from: 4, to: 5 },
      ],
    ],
  ])('finds %s', (_name, before, after, expected) => {
    expect(changedLineHunks(before, after)).toEqual(expected);
  });

  it('finds nothing when nothing changed', () => {
    expect(changedLineHunks('a\nb', 'a\nb')).toEqual([]);
  });
});
