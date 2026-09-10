import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from './Game';

/** A game with one sheet, something drawn on the row below the first, and a use of that number. */
function drawn(): { game: Game; doc: Y.Doc } {
  const doc = new Y.Doc();
  const game = new Game(doc);
  // Sprite 16 is the first cell of the second row on a sheet sixteen cells across.
  game.setPixel(0, 8, 7);
  game.setFlag(16, 3);
  game.setTile(2, 2, 16);
  game.addFile('main', 'function _draw()\ngfx.draw_sprite(16, 0, 0)\nend\n');

  return { game, doc };
}

/**
 * A sheet keeps its pixels by position, so widening it re-flows the grid of numbers over an
 * unchanged picture: the cell that was 16 is 24 once the sheet is twenty-four cells across. Every
 * place that wrote 16 by hand has to be brought along, or the game draws something else.
 */
describe('resizing a sheet renumbers what named its sprites', () => {
  it('counts what it would move before moving anything', () => {
    const { game } = drawn();
    const sheet = game.sheets[0];
    if (!sheet) throw new Error('no sheet');

    const preview = game.previewResize(sheet.id, 192, 128);

    expect(preview.tiles).toBe(1);
    expect(preview.calls).toBe(1);
    expect(preview.unsure).toBe(0);
    expect(preview.lost).toBe(0);
    expect(preview.moves).toBeGreaterThan(0);
  });

  it('brings the tiles, the flags and the code along', () => {
    const { game } = drawn();
    const sheet = game.sheets[0];
    if (!sheet) throw new Error('no sheet');

    game.resizeSheet(sheet.id, 192, 128);

    expect(game.getTile(2, 2)).toBe(24);
    expect(game.getFlag(24)).toBe(3);
    expect(game.getFlag(16)).toBe(0);
    expect(game.files[0]?.text.toString()).toContain('gfx.draw_sprite(24, 0, 0)');
    // And the picture itself has not moved: it was never numbered, only positioned.
    expect(game.getPixel(0, 8)).toBe(7);
  });

  /** A number with nowhere left to point is not guessed at: the tile is cleared. */
  it('clears a tile whose cell falls outside the new shape', () => {
    const { game } = drawn();
    const sheet = game.sheets[0];
    if (!sheet) throw new Error('no sheet');
    game.setTile(3, 3, 24);

    game.resizeSheet(sheet.id, 64, 128);

    expect(game.getTile(3, 3)).toBe(0);
    // 16 was row 1 column 0, which is still there, eight columns along.
    expect(game.getTile(2, 2)).toBe(8);
  });

  it('leaves everything alone when nothing moves', () => {
    const { game } = drawn();
    const sheet = game.sheets[0];
    if (!sheet) throw new Error('no sheet');

    game.resizeSheet(sheet.id, 128, 192);

    expect(game.getTile(2, 2)).toBe(16);
    expect(game.files[0]?.text.toString()).toContain('gfx.draw_sprite(16, 0, 0)');
  });

  /** Numbers run on from one sheet to the next, so a second sheet moves when the first is cut. */
  it('follows a second sheet when the one before it changes size', () => {
    const { game } = drawn();
    game.addSheet('extra sprites', 64, 64);
    const first = game.sheets[0];
    const second = game.sheets[1];
    if (!first || !second) throw new Error('no sheets');
    expect(second.base).toBe(256);
    game.setTile(4, 4, 256);

    game.resizeSheet(first.id, 64, 128);

    expect(game.sheets[1]?.base).toBe(128);
    expect(game.getTile(4, 4)).toBe(128);
  });
});
