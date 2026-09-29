import { describe, expect, it } from 'vitest';

import { chosenHunkRanges } from './ai-hunks';

const file = (
  id: string,
  before: string,
  after: string,
): { id: string; before: string; after: string } => ({
  id,
  before,
  after,
});

describe('chosenHunkRanges', () => {
  it('sends nothing when nothing was chosen, so every file is applied whole', () => {
    // The regression. The panel used to send a range covering the whole file for a file nobody chose
    // anything in. The server read that as a selection, narrowed to it, found no changed lines in a
    // range containing all of them, and refused the apply — so accepting a change without picking
    // through it, the common case and the one the button is named after, did not work at all.
    const files = [file('main', 'a\nb\nc\n', 'A\nb\nc\n')];
    expect(chosenHunkRanges({}, files)).toEqual([]);
    expect(chosenHunkRanges({ main: [] }, files)).toEqual([]);
  });

  it('sends only the chosen hunks, and only for the files they were chosen in', () => {
    const files = [file('main', 'a\nb\nc\nd\n', 'A\nb\nc\nD\n')];
    // Two separate edits, so the first hunk is lines 0..1.
    expect(chosenHunkRanges({ main: [{ from: 0, to: 1 }] }, files)).toEqual([
      { fileId: 'main', from: 0, to: 1 },
    ]);
    // A file not in the change cannot be chosen, and contributes nothing.
    expect(chosenHunkRanges({ other: [{ from: 0, to: 1 }] }, files)).toEqual([]);
  });

  it('drops a choice that names a hunk the current text does not have', () => {
    // A selection made against an older preview should not be able to name lines that have since
    // moved; it is re-derived from the text on show rather than remembered.
    const files = [file('main', 'a\nb\n', 'A\nb\n')];
    expect(chosenHunkRanges({ main: [{ from: 99, to: 100 }] }, files)).toEqual([]);
  });
});
