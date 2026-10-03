import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { Game, type TileChange } from './Game';
import { FIRST_MAP_ID, KEYS } from './keys';

/** A game with a second map beside the one every game has. */
function withSecondMap(): { game: Game; doc: Y.Doc } {
  const doc = new Y.Doc();
  const game = new Game(doc);
  game.addMap('second', 16, 16, 'm');

  return { game, doc };
}

describe('a tile written on a second map', () => {
  it('lands under that map, and nowhere near the first', () => {
    const { game, doc } = withSecondMap();

    game.maps[1]?.setTile(2, 2, 300);

    const entry = doc.getMap<Y.Map<unknown>>(KEYS.maps).get('m');
    expect((entry?.get('tiles') as Y.Map<number>).get('2,2')).toBe(300);
    expect(doc.getMap<number>(KEYS.tiles).size).toBe(0);
    expect(game.maps[1]?.getTile(2, 2)).toBe(300);
    expect(game.getTile(2, 2)).toBe(0);
    expect(game.mapOf('m')?.getTile(2, 2)).toBe(300);
  });

  it('tells its listeners which map it is on', () => {
    const { game } = withSecondMap();
    const heard: TileChange[][] = [];
    game.onTilesChange((changes) => heard.push(changes));

    game.maps[1]?.setTile(1, 3, 5);
    game.setTile(4, 4, 6);

    expect(heard).toEqual([
      [{ map: 'm', x: 1, y: 3, sprite: 5 }],
      [{ map: FIRST_MAP_ID, x: 4, y: 4, sprite: 6 }],
    ]);
  });

  it('reaches a peer', () => {
    const { game, doc } = withSecondMap();
    const peerDoc = new Y.Doc();
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(doc));
    const peer = new Game(peerDoc);
    const heard = vi.fn();
    peer.onTilesChange(heard);

    game.maps[1]?.setTile(2, 2, 300);
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(doc));

    expect(peer.maps[1]?.getTile(2, 2)).toBe(300);
    expect(heard).toHaveBeenCalledWith([{ map: 'm', x: 2, y: 2, sprite: 300 }]);
  });

  it('is seen even when the map got its first cells in the same transaction', () => {
    const { game } = withSecondMap();
    const heard: TileChange[][] = [];
    game.onTilesChange((changes) => heard.push(changes));

    game.transact(() => {
      game.maps[1]?.setTile(1, 1, 5);
      game.maps[1]?.setTile(2, 2, 6);
    });

    expect(game.maps[1]?.getTile(1, 1)).toBe(5);
    expect(game.maps[1]?.getTile(2, 2)).toBe(6);
    expect(heard.flat()).toEqual(
      expect.arrayContaining([
        { map: 'm', x: 1, y: 1, sprite: 5 },
        { map: 'm', x: 2, y: 2, sprite: 6 },
      ]),
    );
  });

  it('is dropped again by writing zero, leaving no key behind', () => {
    const { game, doc } = withSecondMap();

    game.maps[1]?.setTile(2, 2, 300);
    game.maps[1]?.setTile(2, 2, 0);

    const entry = doc.getMap<Y.Map<unknown>>(KEYS.maps).get('m');
    expect((entry?.get('tiles') as Y.Map<number>).size).toBe(0);
  });
});

describe('resizing a map', () => {
  it('keeps the first map and the geometry saying the same thing', () => {
    const { game, doc } = withSecondMap();

    game.resizeMap(FIRST_MAP_ID, 64, 16);

    expect(game.maps[0]?.width).toBe(64);
    expect(doc.getMap(KEYS.meta).get('mapWidth')).toBe(64);
  });

  it('leaves the geometry alone for any other map', () => {
    const { game, doc } = withSecondMap();
    const before = doc.getMap(KEYS.meta).get('mapWidth');

    game.resizeMap('m', 32, 8);

    expect(game.maps[1]?.width).toBe(32);
    expect(game.maps[1]?.height).toBe(8);
    expect(doc.getMap(KEYS.meta).get('mapWidth')).toBe(before);
  });
});
