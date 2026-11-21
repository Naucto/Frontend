import { colourOf } from '@naucto/ui';
import { describe, expect, it } from 'vitest';

import type { FloppySticker } from '../game-card/floppy.component';
import { sessionStickers } from './session-stickers';
import { sessionOf } from './testing';

const initials = (stickers: FloppySticker[]): string[] =>
  stickers.map((sticker) =>
    sticker.seat ? 'seat' : sticker.hidden ? `(${sticker.initial})` : sticker.initial,
  );

describe('sessionStickers', () => {
  it('lays a session out the same way every time, and two sessions differently', () => {
    const first = sessionStickers(sessionOf(3, 4), null);
    expect(sessionStickers(sessionOf(3, 4), null)).toEqual(first);
    const other = sessionStickers(sessionOf(3, 4, { sessionUuid: 'other room' }), null);
    expect(other.map(({ x, y }) => [x, y])).not.toEqual(first.map(({ x, y }) => [x, y]));
  });

  it('gives each sticker a place of its own on the disk, tilted by 14 degrees at most', () => {
    const stickers = sessionStickers(sessionOf(5, 8), null);
    expect(stickers).toHaveLength(8);
    expect(new Set(stickers.map(({ x, y }) => `${String(x)}:${String(y)}`)).size).toBe(8);
    for (const sticker of stickers) {
      expect(sticker.x).toBeGreaterThan(0);
      expect(sticker.x).toBeLessThan(100);
      expect(Math.abs(sticker.rotation)).toBeLessThanOrEqual(14);
    }
  });

  it('crowns the host and shows the open seats after the players', () => {
    const stickers = sessionStickers(sessionOf(2, 4), null);
    expect(initials(stickers)).toEqual(['p', 'p', 'seat', 'seat']);
    expect(stickers[0]).toMatchObject({ host: true });
    expect(stickers[1]).toMatchObject({ host: false });
  });

  it('colours a player as their avatar is everywhere else, from who they are', () => {
    const [host, guest] = sessionStickers(sessionOf(2, 4), null);
    expect(host).toMatchObject({ color: colourOf(1) });
    expect(guest).toMatchObject({ color: colourOf(2) });
  });

  it('folds the players who do not fit into one card, and keeps a seat in sight', () => {
    expect(initials(sessionStickers(sessionOf(9, 12), null))).toEqual([
      'p',
      'p',
      'p',
      'p',
      'p',
      'p',
      '+3',
      'seat',
    ]);
  });

  it('holds the viewer above the first open seat until they are in', () => {
    const waiting = sessionStickers(sessionOf(2, 4), 'you');
    expect(initials(waiting)).toEqual(['p', 'p', 'seat', 'seat', '(y)']);
    expect(waiting[4]).toMatchObject({ x: waiting[2]?.x, y: waiting[2]?.y });

    const session = sessionOf(2, 4);
    const joined = sessionStickers(
      { ...session, roster: [...session.roster, { id: 9, username: 'you' }], playerCount: 3 },
      'you',
    );
    expect(initials(joined)).toEqual(['p', 'p', 'seat', 'seat', 'y']);
    expect(joined[2]).toMatchObject({ seat: true, hidden: true });
    expect(joined.slice(0, 2)).toEqual(waiting.slice(0, 2));
  });

  it('has neither a seat nor a place for the viewer in a full session', () => {
    expect(initials(sessionStickers(sessionOf(2, 2), 'you'))).toEqual(['p', 'p']);
  });
});
