import { describe, expect, it } from 'vitest';

import { lineDiff } from './ai';

const lines = (rows: { left?: { text: string }; right?: { text: string } }[]): string[] =>
  rows.map((row) => `${row.left?.text ?? ''} | ${row.right?.text ?? ''}`);

describe('lineDiff', () => {
  it('lines unchanged text up, so only real changes show as changed', () => {
    const rows = lineDiff('a\nb\nc\nd\n', 'A\nb\nc\nD\n');
    // The trailing empty line is real — it is the newline at the end of the file — and is shown as
    // itself rather than quietly dropped, so the two panes stay the same height.
    expect(rows.filter((r) => r.kind === 'same').map((r) => r.right?.text)).toEqual(['b', 'c', '']);
    expect(rows.filter((r) => r.kind === 'changed').map((r) => r.right?.text)).toEqual(['A', 'D']);
  });

  it('shows a replacement as a change, not as a line going and a line coming', () => {
    // "This line became that line" is what a person is being asked to accept. Rendering it as a gap
    // and then an insertion makes two separate decisions out of one.
    const rows = lineDiff('x\ny\n', 'x\nY\n');
    expect(rows.map((r) => r.kind)).toEqual(['same', 'changed', 'same']);
    expect(lines(rows)[1]).toBe('y | Y');
  });

  it('numbers lines on the side they are on', () => {
    const rows = lineDiff('one\ntwo\n', 'one\ntwo\nthree\n');
    const added = rows.find((r) => r.kind === 'added');
    expect(added?.right?.number).toBe(3);
    expect(added?.left).toBeUndefined();
    const kept = rows.find((r) => r.kind === 'same');
    expect(kept?.left?.number).toBe(1);
    expect(kept?.right?.number).toBe(1);
  });

  it('carries a pure insertion without claiming the rest moved', () => {
    const rows = lineDiff('a\nc\n', 'a\nb\nc\n');
    expect(rows.map((r) => r.kind)).toEqual(['same', 'added', 'same', 'same']);
    expect(rows[1]?.right?.text).toBe('b');
    expect(rows[2]?.left?.number).toBe(2);
  });

  it('carries a pure deletion', () => {
    const rows = lineDiff('a\nb\nc\n', 'a\nc\n');
    expect(rows.map((r) => r.kind)).toEqual(['same', 'removed', 'same', 'same']);
  });

  it('handles text that is identical', () => {
    const rows = lineDiff('a\nb\n', 'a\nb\n');
    expect(rows.every((r) => r.kind === 'same')).toBe(true);
  });

  it('handles both sides empty', () => {
    expect(lineDiff('', '')).toEqual([
      { left: { number: 1, text: '' }, right: { number: 1, text: '' }, kind: 'same' },
    ]);
  });
});
