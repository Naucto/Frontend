import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from './Game';
import { SPRITE_SIZE } from './keys';
import { applyTutorialAssets } from './tutorial-assets';

describe('applyTutorialAssets', () => {
  it('draws each sprite at its number, sets its flags and paints the map spans', () => {
    const game = new Game(new Y.Doc());
    game.seedDefaults();
    applyTutorialAssets(game, {
      sprites: { '33': ['4.......', '.5......', ...Array<string>(6).fill('........')] },
      flags: { '33': 2 },
      map: [{ row: 3, from: 2, to: 4, tile: 33 }],
    });
    // Sprite 33 is the second cell of the third row of the sheet.
    const ox = (33 % 16) * SPRITE_SIZE;
    const oy = 2 * SPRITE_SIZE;
    expect(game.getPixel(ox, oy)).toBe(4);
    expect(game.getPixel(ox + 1, oy + 1)).toBe(5);
    expect(game.getPixel(ox + 2, oy)).toBe(0);
    expect(game.getFlagBit(33, 1)).toBe(true);
    expect(game.getFlagBit(33, 0)).toBe(false);
    expect([2, 3, 4].map((x) => game.maps[0]?.getTile(x, 3))).toEqual([33, 33, 33]);
    expect(game.maps[0]?.getTile(5, 3)).toBe(0);
  });
});
