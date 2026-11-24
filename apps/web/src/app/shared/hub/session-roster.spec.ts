import { describe, expect, it } from 'vitest';

import { rosterRows } from './session-roster';
import { sessionOf } from './testing';

const kinds = (rows: ReturnType<typeof rosterRows>): string[] => rows.map((row) => row.kind);

describe('rosterRows', () => {
  it('names everyone and counts the seats left', () => {
    const rows = rosterRows(sessionOf(2, 4), null);
    expect(kinds(rows)).toEqual(['player', 'player', 'open']);
    expect(rows[0]).toMatchObject({ host: true, you: false });
    expect(rows[2]).toEqual({ kind: 'open', seats: 2 });
  });

  it('has no open row for a full session', () => {
    expect(kinds(rosterRows(sessionOf(4, 4), null))).toEqual([
      'player',
      'player',
      'player',
      'player',
    ]);
  });

  it('folds whoever does not fit in four rows into one, with at most four faces', () => {
    const rows = rosterRows(sessionOf(9, 12), null);
    expect(kinds(rows)).toEqual(['player', 'player', 'more', 'open']);
    expect(rows[2]).toMatchObject({ count: 7 });
    expect(rows[2]).toHaveProperty('faces.length', 4);
    expect(rows[3]).toEqual({ kind: 'open', seats: 3 });
  });

  it('puts the host first and the viewer second, wherever they sat down', () => {
    const rows = rosterRows(sessionOf(6, 6, { hostUsername: 'player4' }), 'player6');
    expect(rows[0]).toMatchObject({ player: { username: 'player4' }, host: true });
    expect(rows[1]).toMatchObject({ player: { username: 'player6' }, you: true });
    expect(rows[3]).toMatchObject({ kind: 'more', count: 3 });
  });
});
