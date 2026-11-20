import { describe, expect, it } from 'vitest';

import type { HubSession, SessionPlayer } from './hub-game';
import { rosterRows } from './session-roster';

const players = (count: number): SessionPlayer[] =>
  Array.from({ length: count }, (_, i) => ({ id: i + 1, username: `player${String(i + 1)}` }));

const session = (seated: number, capacity: number, hostId = 1): HubSession => ({
  id: 'room',
  startedAt: '2026-11-20T10:00:00Z',
  hostId,
  players: players(seated),
  capacity,
});

const kinds = (rows: ReturnType<typeof rosterRows>): string[] => rows.map((row) => row.kind);

describe('rosterRows', () => {
  it('names everyone and counts the seats left', () => {
    const rows = rosterRows(session(2, 4), null);
    expect(kinds(rows)).toEqual(['player', 'player', 'open']);
    expect(rows[0]).toMatchObject({ host: true, you: false });
    expect(rows[2]).toEqual({ kind: 'open', seats: 2 });
  });

  it('has no open row for a full session', () => {
    expect(kinds(rosterRows(session(4, 4), null))).toEqual([
      'player',
      'player',
      'player',
      'player',
    ]);
  });

  it('folds whoever does not fit in four rows into one, with at most four faces', () => {
    const rows = rosterRows(session(9, 12), null);
    expect(kinds(rows)).toEqual(['player', 'player', 'more', 'open']);
    expect(rows[2]).toMatchObject({ count: 7 });
    expect(rows[2]).toHaveProperty('faces.length', 4);
    expect(rows[3]).toEqual({ kind: 'open', seats: 3 });
  });

  it('puts the host first and the viewer second, wherever they sat down', () => {
    const rows = rosterRows(session(6, 6, 4), 6);
    expect(rows[0]).toMatchObject({ player: { id: 4 }, host: true });
    expect(rows[1]).toMatchObject({ player: { id: 6 }, you: true });
    expect(rows[3]).toMatchObject({ kind: 'more', count: 3 });
  });
});
