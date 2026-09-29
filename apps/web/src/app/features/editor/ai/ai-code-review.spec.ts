import { lineDiff } from '@naucto/engine';
import { describe, expect, it } from 'vitest';

import { chosenRanges, reviewableRows } from './ai-code-review.component';

describe('reviewable rows', () => {
  it('offers every changed line and nothing that did not change', () => {
    const rows = lineDiff('a\nb\nc\nd\n', 'A\nb\nc\nD\n');
    const offered = reviewableRows(rows);
    expect(offered.map((e) => e.row.kind)).toEqual(['changed', 'changed']);
    // And it keeps the index, so a choice names the row and not a position in the offered list.
    expect(offered.map((e) => e.index)).toEqual([0, 3]);
  });
});

describe('chosen ranges', () => {
  it('is a range per chosen line, 1-based in the new file', () => {
    const rows = lineDiff('a\nb\nc\n', 'A\nb\nC\n');
    expect(chosenRanges(new Set([0]), rows)).toEqual([{ from: 1, to: 1 }]);
    expect(chosenRanges(new Set([0, 2]), rows)).toEqual([
      { from: 1, to: 1 },
      { from: 3, to: 3 },
    ]);
  });

  it('merges chosen lines that sit next to each other', () => {
    // Two adjacent additions are one thing to accept, and sending them as one range means the server
    // narrows to a single contiguous run rather than stitching two separate ones.
    const rows = lineDiff('a\n', 'a\nb\nc\n');
    expect(chosenRanges(new Set([1, 2]), rows)).toEqual([{ from: 2, to: 3 }]);
  });

  it('is empty when nothing is chosen, which means the whole file is applied', () => {
    const rows = lineDiff('a\n', 'A\n');
    expect(chosenRanges(new Set(), rows)).toEqual([]);
  });

  it('never offers a deleted line, since there is nothing to take from it', () => {
    const rows = lineDiff('a\nb\n', 'a\n');
    expect(chosenRanges(new Set([1]), rows)).toEqual([]);
  });
});
