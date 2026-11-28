/** One row of a unified diff: a line kept, a line of the old text, a line of the new, or both. */
export interface DiffRow {
  /** 1-based line number in the old text, absent when the line is new. */
  left?: { number: number; text: string };
  /** 1-based line number in the new text, absent when the line is gone. */
  right?: { number: number; text: string };
  kind: 'same' | 'changed' | 'added' | 'removed';
}

/** Past this many cells the alignment is quadratic in time a person would notice. */
const LCS_GUARD = 4_000_000;

/**
 * The two texts aligned line by line on their longest common subsequence, so the lines that did
 * not move line up and what is left is what differs. A removal followed by an addition at the same
 * place is paired into a `changed` row: "this line became that line" is what a person is asked to
 * keep or not.
 *
 * Past the guard, only the shared prefix and suffix are aligned. That shows more as changed rather
 * than less, which is the safe direction for a review.
 */
export function lineDiff(before: string, after: string): DiffRow[] {
  const a = before.split('\n');
  const b = after.split('\n');
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const rows: DiffRow[] = [];
  const same = (i: number, j: number): void => {
    rows.push({
      left: { number: i + 1, text: a[i] ?? '' },
      right: { number: j + 1, text: b[j] ?? '' },
      kind: 'same',
    });
  };
  for (let i = 0; i < head; i += 1) {
    same(i, i);
  }
  const removed = (i: number): void => {
    rows.push({ left: { number: head + i + 1, text: midA[i] ?? '' }, kind: 'removed' });
  };
  const added = (j: number): void => {
    rows.push({ right: { number: head + j + 1, text: midB[j] ?? '' }, kind: 'added' });
  };
  if (midA.length * midB.length > LCS_GUARD) {
    midA.forEach((_, i) => {
      removed(i);
    });
    midB.forEach((_, j) => {
      added(j);
    });
  } else {
    const stride = midB.length + 1;
    const lcs = new Int32Array((midA.length + 1) * stride);
    const at = (i: number, j: number): number => lcs[i * stride + j] ?? 0;
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        lcs[i * stride + j] =
          midA[i] === midB[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        same(head + i, head + j);
        i += 1;
        j += 1;
        continue;
      }
      const drop = at(i + 1, j) >= at(i, j + 1);
      const paired = drop && at(i + 1, j + 1) >= Math.max(at(i + 1, j), at(i, j + 1));
      if (paired) {
        rows.push({
          left: { number: head + i + 1, text: midA[i] ?? '' },
          right: { number: head + j + 1, text: midB[j] ?? '' },
          kind: 'changed',
        });
        i += 1;
        j += 1;
      } else if (drop) {
        removed(i);
        i += 1;
      } else {
        added(j);
        j += 1;
      }
    }
    for (; i < midA.length; i += 1) {
      removed(i);
    }
    for (; j < midB.length; j += 1) {
      added(j);
    }
  }
  for (let k = 0; k < tail; k += 1) {
    same(a.length - tail + k, b.length - tail + k);
  }
  return rows;
}

/** A run of consecutive changed rows, which is what one accept or reject takes. */
export interface LineHunk {
  /** Index of the hunk's first row in the rows it was cut from. */
  start: number;
  /** One past its last row. */
  end: number;
}

/** The standard hunks of a diff: every run of rows that are not `same`. */
export function lineHunks(rows: readonly DiffRow[]): LineHunk[] {
  const hunks: LineHunk[] = [];
  let open: number | null = null;
  rows.forEach((row, i) => {
    if (row.kind === 'same') {
      if (open !== null) {
        hunks.push({ start: open, end: i });
        open = null;
      }
    } else {
      open ??= i;
    }
  });
  if (open !== null) {
    hunks.push({ start: open, end: rows.length });
  }
  return hunks;
}

/**
 * The text the rows give when the hunks in `taken` are taken from the new side and every other
 * one is left as the old side had it.
 */
export function mergeLines(
  rows: readonly DiffRow[],
  hunks: readonly LineHunk[],
  taken: ReadonlySet<number>,
): string {
  const out: string[] = [];
  const takenRows = new Set<number>();
  hunks.forEach((hunk, index) => {
    if (taken.has(index)) {
      for (let i = hunk.start; i < hunk.end; i += 1) {
        takenRows.add(i);
      }
    }
  });
  rows.forEach((row, i) => {
    const side = takenRows.has(i) ? row.right : row.left;
    if (side) {
      out.push(side.text);
    }
  });
  return out.join('\n');
}

/** A piece of a changed line: kept, gone from the old one, or new in the new one. */
export interface WordPart {
  text: string;
  kind: 'same' | 'removed' | 'added';
}

/**
 * The word diff of one changed line, on tokens that are a word, a run of spaces or one other
 * character, so `x = 1` → `x = 2` marks the `1` and the `2` and nothing else.
 */
export function wordDiff(before: string, after: string): WordPart[] {
  const split = (text: string): string[] => text.match(/\w+|\s+|[^\w\s]/g) ?? [];
  const a = split(before);
  const b = split(after);
  const stride = b.length + 1;
  const lcs = new Int32Array((a.length + 1) * stride);
  const at = (i: number, j: number): number => lcs[i * stride + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * stride + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const parts: WordPart[] = [];
  const push = (text: string, kind: WordPart['kind']): void => {
    const last = parts.at(-1);
    if (last?.kind === kind) {
      last.text += text;
    } else {
      parts.push({ text, kind });
    }
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(a[i] ?? '', 'same');
      i += 1;
      j += 1;
    } else if (j >= b.length || (i < a.length && at(i + 1, j) >= at(i, j + 1))) {
      push(a[i] ?? '', 'removed');
      i += 1;
    } else {
      push(b[j] ?? '', 'added');
      j += 1;
    }
  }
  return parts;
}
