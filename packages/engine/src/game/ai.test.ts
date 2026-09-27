import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { AI_KEYS, aiContext, diffGames, encodeState, gameFromState, readLocks } from './ai';
import { Game } from './Game';

const fixture = (): Game => {
  const game = new Game(new Y.Doc());
  game.seedDefaults();

  return game;
};

describe('AI context and previews', () => {
  it('shares unsaved work compactly and without executing anything', () => {
    const game = fixture();
    game.files[0]?.text.insert(0, '-- unsaved\n');
    game.setPixel(1, 0, 12);
    const context = aiContext(game) as { code: { text: string }[]; sheets: { pixels: string }[] };
    expect(context.code[0]?.text.startsWith('-- unsaved')).toBe(true);
    expect(context.sheets[0]?.pixels[1]).toBe('c');
    expect(context.sheets[0]?.pixels).toHaveLength(128 * 128);
  });

  it('shows a multiplayer declaration change, and says when it gives a client more', () => {
    // A permissions change is a security change. It used to have no section in the diff at all, so
    // a proposal that only touched multiplayer previewed as empty and was one click from applied.
    const game = fixture();
    game.netPermissions.set('secrets', { flags: 0 });
    const result = gameFromState(encodeState(game.doc));
    result.netPermissions.delete('secrets');
    result.netPermissions.set('room', { flags: 3, default: 'cave' });

    const net = diffGames(game, result).net;
    expect(net.map((row) => row.key)).toEqual(['net:room', 'net:secrets']);
    // An undeclared path is open, so dropping a declaration hands a client authority it lacked.
    expect(net.find((row) => row.key === 'net:secrets')?.widened).toBe(true);
    expect(net.find((row) => row.key === 'net:secrets')?.before).toContain('cannot read');
    expect(net.find((row) => row.key === 'net:secrets')?.after).toContain('open to every client');
    // Adding a start value grants nothing, so it must not read as a widening.
    expect(net.find((row) => row.key === 'net:room')?.widened).toBe(false);
    expect(net.find((row) => row.key === 'net:room')?.after).toContain('cave');
  });

  it('reads a malformed declaration as what the host reads it as', () => {
    const game = fixture();
    const result = gameFromState(encodeState(game.doc));
    result.netPermissions.set('secrets', { default: 1 } as never);
    const row = diffGames(game, result).net[0];
    // The host's resolver skips a non-numeric entry, which is open. Saying "private" here would be
    // a confident answer about a boundary that is not in force.
    expect(row?.after).toContain('malformed (treated as open)');
  });

  it('describes a result state as the changes it would make, leaving the live game alone', () => {
    const game = fixture();
    const result = gameFromState(encodeState(game.doc));
    result.files[0]?.text.insert(0, 'x');
    result.setPixel(0, 0, 3);
    result.setTile(1, 1, 2);
    result.addMap('second', 4, 4, 'level-2');
    result.doc.getMap(AI_KEYS.catalog).set('grass', { name: 'grass' });
    result.instruments.set('lead', '{}');
    const diff = diffGames(game, result);
    expect(diff.code).toHaveLength(1);
    expect(diff.sheets).toEqual([{ id: '0', name: expect.any(String) as string, changed: 1 }]);
    expect(diff.maps.find((m) => m.id === 'level-2')?.created).toBe(true);
    expect(diff.maps.find((m) => m.id !== 'level-2')?.changed).toBe(1);
    expect(diff.catalog.map((c) => c.id)).toEqual(['grass']);
    expect(diff.sound.map((s) => s.key)).toEqual(['instrument:lead']);
    expect(game.maps).toHaveLength(1);
  });

  it('restores catalog, levels and locks with project history, but never the provenance receipts', () => {
    const game = fixture();
    const initial = Y.encodeStateAsUpdate(game.doc);
    game.doc.getMap(AI_KEYS.locks).set('spawn', {
      name: 'spawn',
      target: 'map',
      resourceId: '0',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
    game.doc.getMap(AI_KEYS.catalog).set('grass', { name: 'grass' });
    game.doc.getMap(AI_KEYS.applied).set('proposal', { categories: ['CODE'] });
    expect(readLocks(game).map((lock) => lock.name)).toEqual(['spawn']);
    game.restoreFrom(initial);
    expect(game.doc.getMap(AI_KEYS.locks).size).toBe(0);
    expect(game.doc.getMap(AI_KEYS.catalog).size).toBe(0);
    expect(game.doc.getMap(AI_KEYS.applied).has('proposal')).toBe(true);
  });
});
