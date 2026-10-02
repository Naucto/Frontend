import { describe, expect, it } from 'vitest';

import { blockAnchorLine, chosenBlockRanges, reviewBlocks } from './ai-code-review.component';

const before = ['one', 'A', 'two', 'three', 'gone', 'four'].join('\n');
const after = ['one', 'A2', 'two', 'three', 'four', 'new'].join('\n');

describe('reviewBlocks', () => {
  it('offers one block per separate edit, as lines of the new text from zero', () => {
    // A replaced line, a deleted line, and an added one at the end.
    expect(reviewBlocks(before, after)).toEqual([
      { from: 1, to: 2 },
      { from: 4, to: 4 },
      { from: 5, to: 6 },
    ]);
  });
});

describe('chosenBlockRanges', () => {
  const blocks = reviewBlocks(before, after);

  it('sends the chosen blocks as the API takes them: from zero, end exclusive', () => {
    // The old review sent 1-based inclusive lines, which the API reads as the line below — or, for
    // a single line, as nothing at all.
    expect(chosenBlockRanges(new Set([0, 2]), blocks)).toEqual([
      { from: 1, to: 2 },
      { from: 5, to: 6 },
    ]);
  });

  it('sends a deletion one line wide, so the server can tell which one it is', () => {
    expect(chosenBlockRanges(new Set([1]), blocks)).toEqual([{ from: 4, to: 5 }]);
  });

  it('sends nothing for nothing chosen', () => {
    expect(chosenBlockRanges(new Set(), blocks)).toEqual([]);
  });
});

describe('blockAnchorLine', () => {
  it("puts a block's toggle on its first new line", () => {
    expect(blockAnchorLine({ from: 1, to: 2 }, 6)).toBe(2);
  });

  it('puts a deletion on the line that now follows it, or the last line at the end of the file', () => {
    expect(blockAnchorLine({ from: 4, to: 4 }, 6)).toBe(5);
    expect(blockAnchorLine({ from: 6, to: 6 }, 6)).toBe(6);
  });
});
