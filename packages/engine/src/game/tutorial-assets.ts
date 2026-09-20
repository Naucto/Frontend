import type { Game } from './Game';
import { SPRITE_SIZE, SPRITES_PER_ROW } from './keys';

/**
 * What a tutorial's game holds besides its code, written the way a person would say it.
 *
 * A tutorial page carries its whole game so that "copy to new game" gives a game that plays, and
 * so that the pictures the page shows are taken from the same thing the reader gets. Sprites are
 * rows of hex palette indices with `.` for transparent, one entry per sprite number; flags are the
 * bits set on a sprite, as a number; the map is spans of one tile along a row.
 */
export interface TutorialAssets {
  sprites?: Record<string, readonly string[]>;
  flags?: Record<string, number>;
  map?: readonly { row: number; from: number; to: number; tile: number }[];
}

/** Writes the assets into the game's first sheet and first map, over whatever was there. */
export function applyTutorialAssets(game: Game, assets: TutorialAssets): void {
  for (const [index, rows] of Object.entries(assets.sprites ?? {})) {
    const n = Number(index);
    const ox = (n % SPRITES_PER_ROW) * SPRITE_SIZE;
    const oy = Math.floor(n / SPRITES_PER_ROW) * SPRITE_SIZE;
    for (let y = 0; y < SPRITE_SIZE; y++) {
      const row = rows[y] ?? '';
      for (let x = 0; x < SPRITE_SIZE; x++) {
        const ch = row[x] ?? '.';
        game.setPixel(ox + x, oy + y, ch === '.' ? 0 : Number.parseInt(ch, 16));
      }
    }
  }
  for (const [index, value] of Object.entries(assets.flags ?? {}))
    game.setFlag(Number(index), value);
  for (const span of assets.map ?? [])
    for (let x = span.from; x <= span.to; x++) game.setTile(x, span.row, span.tile);
}
