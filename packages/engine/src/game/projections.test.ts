import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { blankGame } from './blank-game';
import { EditableGame } from './EditableGame';
import { FIRST_MAP_ID, FIRST_SHEET_ID } from './keys';

/** Two games on the same document, the way two peers hold it. */
function paired(): { gameA: EditableGame; gameB: EditableGame; sync: () => void } {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const sync = (): void => {
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
  };

  const gameA = blankGame(docA);
  sync();

  return { gameA, gameB: new EditableGame(docB), sync };
}

describe('the sheet and map projections', () => {
  it('are the same objects until the document changes them', () => {
    const game = blankGame();

    expect(game.sheets).toBe(game.sheets);
    expect(game.maps).toBe(game.maps);
    expect(game.sheetOf(3)).toBe(game.sheets[0]);
  });

  it('still share their buffers with the document roots', () => {
    const game = blankGame();

    expect(game.sheets[0]?.pixels).toBe(game.sheets[0]?.pixels);
    expect(game.maps[0]?.tiles).toBe(game.maps[0]?.tiles);
  });

  it('keep the same sheet while its pixels change, and show the change', () => {
    const game = blankGame();
    const before = game.sheets;

    game.sheets[0]?.setPixel(3, 4, 7);

    expect(game.sheets).toBe(before);
    expect(game.sheets[0]?.getPixel(3, 4)).toBe(7);
  });

  it('are rebuilt when a sheet or a map is added, renamed or removed', () => {
    const game = blankGame();
    const sheets = game.sheets;
    const maps = game.maps;

    game.addSheet('extra', 64, 64, 'x');
    expect(game.sheets).not.toBe(sheets);
    expect(game.sheets).toHaveLength(2);

    const named = game.sheets;
    game.describeSheet('x', 'tiles', null);
    expect(game.sheets).not.toBe(named);
    expect(game.sheets[1]?.name).toBe('tiles');

    game.addMap('second', 16, 16, 'm');
    expect(game.maps).not.toBe(maps);
    expect(game.maps).toHaveLength(2);

    const two = game.maps;
    game.removeMap('m');
    expect(game.maps).not.toBe(two);
    expect(game.maps).toHaveLength(1);
  });

  it('are rebuilt when the first sheet or map is resized through the geometry', () => {
    const game = blankGame();
    const sheets = game.sheets;
    const maps = game.maps;

    game.transact(() => {
      game.resizeSheet(FIRST_SHEET_ID, 64, game.geometry.sheetHeight);
      game.resizeMap(FIRST_MAP_ID, 64, game.geometry.mapHeight);
    });

    expect(game.sheets).not.toBe(sheets);
    expect(game.sheets[0]?.width).toBe(64);
    expect(game.maps).not.toBe(maps);
    expect(game.maps[0]?.width).toBe(64);
  });

  it('are rebuilt when a peer adds a sheet or resizes a map', () => {
    const { gameA, gameB, sync } = paired();
    const sheets = gameA.sheets;
    const maps = gameA.maps;

    gameB.addSheet('theirs', 32, 32, 'y');
    gameB.resizeMap(FIRST_MAP_ID, 200, gameB.geometry.mapHeight);
    sync();

    expect(gameA.sheets).not.toBe(sheets);
    expect(gameA.sheets.map((sheet) => sheet.id)).toContain('y');
    expect(gameA.maps).not.toBe(maps);
    expect(gameA.maps[0]?.width).toBe(200);
  });
});
