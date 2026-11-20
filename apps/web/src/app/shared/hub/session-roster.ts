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
 * not fit before it fold into one "+N more" row, which also counts those the session did not name.
 */
export function rosterRows(session: HubSession, viewer: string | null): RosterRow[] {
  const rank = (player: SessionPlayer): number =>
    player.username === session.hostUsername ? 0 : player.username === viewer ? 1 : 2;
  const players = [...session.roster].sort((a, b) => rank(a) - rank(b));
  const seats = session.maxPlayers - session.playerCount;
  const room = ROWS - (seats > 0 ? 1 : 0);
  const named = session.playerCount > room ? players.slice(0, room - 1) : players;
  const folded = session.playerCount - named.length;
  return [
    ...named.map((player): RosterRow => ({
      kind: 'player',
      player,
      host: player.username === session.hostUsername,
      you: player.username === viewer,
    })),
    ...(folded > 0
      ? [
          {
            kind: 'more',
            count: folded,
            faces: players.slice(named.length, named.length + FACES),
          } as const,
        ]
      : []),
    ...(seats > 0 ? [{ kind: 'open', seats } as const] : []),
  ];
}
