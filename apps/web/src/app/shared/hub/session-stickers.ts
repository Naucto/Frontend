import { BUBBLEGUM_16 } from '@naucto/engine';
import { colourOf } from '@naucto/ui';

import type { FloppySticker } from '../game-card/floppy.component';
import type { HubSession, SessionPlayer } from './hub-game';

/** Where a sticker may go, by its centre in percent of the disk: its rim, clear of the cover's middle. */
const SLOTS = [
  [13, 14],
  [87, 15],
  [9, 52],
  [91, 49],
  [29, 34],
  [72, 33],
  [10, 84],
  [90, 85],
] as const;
/** The viewer's own sticker is gold, as their row of the roster is. */
const VIEWER_INK = BUBBLEGUM_16[4];

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  }
  return value >>> 0;
}

/** Numbers from 0 to 1 that are the same every time for a given seed. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export const displayName = (player: SessionPlayer): string => player.nickname ?? player.username;

/**
 * A session's players as stickers on its disk, each session laying them out its own way and the
 * same way every time. The others come first, the host crowned; those who do not fit fold into one
 * "+N" card; then come the seats still open, as far as there is room.
 *
 * The viewer's own sticker is always there, over the first open seat, and hidden until they are
 * in: joining lands it on that seat rather than moving anyone else's.
 */
export function sessionStickers(session: HubSession, viewer: string | null): FloppySticker[] {
  const random = seeded(hash(session.sessionUuid));
  const left = [...SLOTS];
  const places = SLOTS.flatMap(() => left.splice(Math.floor(random() * left.length), 1)).map(
    ([x, y]) => ({
      x: x + (random() - 0.5) * 6,
      y: y + (random() - 0.5) * 6,
      rotation: Math.round((random() * 2 - 1) * 14),
    }),
  );

  const joined = session.roster.some((player) => player.username === viewer);
  const others = session.roster.filter((player) => player.username !== viewer);
  const seated = session.playerCount - (joined ? 1 : 0);
  const free = session.maxPlayers - seated;
  const seatRow = free > 0 ? 1 : 0;
  const shown =
    seated + seatRow <= SLOTS.length ? others : others.slice(0, SLOTS.length - seatRow - 1);
  const folded = seated - shown.length;
  const seats = Math.min(free, SLOTS.length - shown.length - (folded ? 1 : 0));

  const cards = [
    ...shown.map((player) => ({
      initial: displayName(player)[0] ?? '?',
      color: colourOf(player.username),
      host: player.username === session.hostUsername,
    })),
    ...(folded ? [{ initial: `+${String(folded)}`, color: 'var(--color-key-lit)' }] : []),
  ];
  const stickers = places.slice(0, cards.length + seats).map((place, i): FloppySticker => {
    const card = cards[i];
    return card
      ? { ...place, ...card }
      : { ...place, seat: true, hidden: i === cards.length && joined };
  });
  const landing = places[cards.length];
  if (viewer && seats > 0 && landing) {
    stickers.push({
      ...landing,
      initial: viewer[0] ?? '?',
      color: VIEWER_INK,
      host: viewer === session.hostUsername,
      hidden: !joined,
    });
  }
  return stickers;
}
