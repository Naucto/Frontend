import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { Game } from './Game';

describe('declared actions', () => {
  it('round-trips through the document', () => {
    const doc = new Y.Doc();
    const game = new Game(doc);
    expect(game.declaredActions).toEqual([]);

    game.setDeclaredActions([
      { action: 'a', label: 'Jump' },
      { action: 'left', label: 'Walk' },
    ]);
    expect(game.declaredActions).toEqual([
      { action: 'a', label: 'Jump' },
      { action: 'left', label: 'Walk' },
    ]);

    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    expect(new Game(remote).declaredActions).toEqual(game.declaredActions);
  });

  it('drops blank labels and trims the rest', () => {
    const game = new Game(new Y.Doc());
    game.setDeclaredActions([
      { action: 'a', label: '  Jump ' },
      { action: 'b', label: '   ' },
      { action: 'pause', label: '' },
    ]);
    expect(game.declaredActions).toEqual([{ action: 'a', label: 'Jump' }]);

    game.setDeclaredActions([{ action: 'a', label: '' }]);
    expect(game.declaredActions).toEqual([]);
  });

  it('ignores entries the document holds in a shape it does not know', () => {
    const doc = new Y.Doc();
    doc
      .getMap('game.meta')
      .set('actions', [
        { action: 'a', label: 'Jump' },
        { action: 'fire', label: 'Fire' },
        { action: 'b', label: 2 },
        'x',
        null,
      ]);
    expect(new Game(doc).declaredActions).toEqual([{ action: 'a', label: 'Jump' }]);
  });
});
