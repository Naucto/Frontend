import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from './Game';

/** Two games on the same document, the way two peers hold it. */
function paired(): { a: Game; b: Game; sync: () => void } {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const sync = (): void => {
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB));
  };

  return { a: new Game(docA), b: new Game(docB), sync };
}

describe('the sheet and map projections', () => {
  it('are the same objects until the document changes them', () => {
    const game = new Game(new Y.Doc());

    expect(game.sheets).toBe(game.sheets);
    expect(game.maps).toBe(game.maps);
    expect(game.sheetOf(3)).toBe(game.sheets[0]);
  });

  it('still share their buffers with the document roots', () => {
    const game = new Game(new Y.Doc());

    expect(game.sheets[0]?.pixels).toBe(game.sheet);
    expect(game.maps[0]?.tiles).toBe(game.tiles);
  });

  it('keep the same sheet while its pixels change, and show the change', () => {
    const game = new Game(new Y.Doc());
    const before = game.sheets;

    game.setPixel(3, 4, 7);

    expect(game.sheets).toBe(before);
    expect(game.sheets[0]?.getPixel(3, 4)).toBe(7);
  });

  it('are rebuilt when a sheet or a map is added, renamed or removed', () => {
    const game = new Game(new Y.Doc());
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
    const game = new Game(new Y.Doc());
    const sheets = game.sheets;
    const maps = game.maps;

    game.resize({ sheetWidth: 64, mapWidth: 64 });

    expect(game.sheets).not.toBe(sheets);
    expect(game.sheets[0]?.width).toBe(64);
    expect(game.maps).not.toBe(maps);
    expect(game.maps[0]?.width).toBe(64);
  });

  it('are rebuilt when a peer adds a sheet or resizes a map', () => {
    const { a, b, sync } = paired();
    const sheets = a.sheets;
    const maps = a.maps;

    b.addSheet('theirs', 32, 32, 'y');
    b.resize({ mapWidth: 200 });
    sync();

    expect(a.sheets).not.toBe(sheets);
    expect(a.sheets.map((s) => s.id)).toContain('y');
    expect(a.maps).not.toBe(maps);
    expect(a.maps[0]?.width).toBe(200);
  });
});
