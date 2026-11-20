import type { HubSession, SessionPlayer } from './hub-game';

export type RosterRow =
  | { kind: 'player'; player: SessionPlayer; host: boolean; you: boolean }
  | { kind: 'more'; count: number; faces: readonly SessionPlayer[] }
  | { kind: 'open'; seats: number };

/** A roster never runs past this many rows. */
const ROWS = 4;
/** How many of those folded into "+N more" still show their face. */
const FACES = 4;

/**
 * A session's roster in at most four rows: the host first, then the viewer if they are in, then
 * the others as they came. The last row says how many seats are open while any is; players who do
 * not fit before it fold into one "+N more" row.
 */
export function rosterRows(session: HubSession, viewerId: number | null): RosterRow[] {
  const rank = (player: SessionPlayer): number =>
    player.id === session.hostId ? 0 : player.id === viewerId ? 1 : 2;
  const players = [...session.players].sort((a, b) => rank(a) - rank(b));
  const seats = session.capacity - players.length;
  const room = ROWS - (seats > 0 ? 1 : 0);
  const named = players.length > room ? players.slice(0, room - 1) : players;
  const folded = players.slice(named.length);
  return [
    ...named.map((player): RosterRow => ({
      kind: 'player',
      player,
      host: player.id === session.hostId,
      you: player.id === viewerId,
    })),
    ...(folded.length
      ? [{ kind: 'more', count: folded.length, faces: folded.slice(0, FACES) } as const]
      : []),
    ...(seats > 0 ? [{ kind: 'open', seats } as const] : []),
  ];
}
