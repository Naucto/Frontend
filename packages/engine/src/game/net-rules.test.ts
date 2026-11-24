import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { EditableGame } from './EditableGame';
import { type NetRule } from './Game';

/** The rules as the document holds them, by path. */
function entries(game: EditableGame): Record<string, NetRule> {
  const out: Record<string, NetRule> = {};
  game.netPermissions.forEach((rule, path) => {
    out[path] = rule;
  });

  return out;
}

/** What another client reads of the same document. */
function remoteOf(game: EditableGame): EditableGame {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(game.doc));

  return new EditableGame(doc);
}

describe('the net rules of a game', () => {
  it('declares a path without a rule, and leaves a path already named as it is', () => {
    const game = new EditableGame(new Y.Doc());
    game.setNetPermission('players', 1);
    game.declareNetPath('players.score');
    game.declareNetPath('players');

    expect(entries(game)).toEqual({ players: { flags: 1 }, 'players.score': {} });
    expect(entries(remoteOf(game))).toEqual({ players: { flags: 1 }, 'players.score': {} });
  });

  it('gives a declared path a rule of its own, and takes it back without forgetting the path', () => {
    const game = new EditableGame(new Y.Doc());
    game.declareNetPath('players.score');
    game.setNetPermission('players.score', 3);
    expect(entries(game)).toEqual({ 'players.score': { flags: 3 } });

    game.inheritNetPermission('players.score');
    expect(entries(remoteOf(game))).toEqual({ 'players.score': {} });
  });

  it('keeps the rules under a path that inherits again', () => {
    const game = new EditableGame(new Y.Doc());
    game.setNetPermission('players', 1);
    game.setNetPermission('players.name', 3);
    game.inheritNetPermission('players');

    expect(entries(game)).toEqual({ players: {}, 'players.name': { flags: 3 } });
  });

  it('forgets the root once it has no rule, since nothing is above it', () => {
    const game = new EditableGame(new Y.Doc());
    game.setNetPermission('', 0);
    game.inheritNetPermission('');

    expect(entries(game)).toEqual({});
  });

  it('writes nothing to take back a rule a path does not have', () => {
    const game = new EditableGame(new Y.Doc());
    game.declareNetPath('score');
    const before = Y.encodeStateAsUpdate(game.doc);
    game.inheritNetPermission('score');
    game.inheritNetPermission('elsewhere');

    expect(Y.encodeStateAsUpdate(game.doc)).toEqual(before);
  });

  it('renames and removes a branch with its declarations', () => {
    const game = new EditableGame(new Y.Doc());
    game.setNetPermission('players', 1);
    game.declareNetPath('players.score');
    game.declareNetPath('playersmeta');
    game.moveNetPermissions('players', 'people');

    expect(entries(remoteOf(game))).toEqual({
      people: { flags: 1 },
      'people.score': {},
      playersmeta: {},
    });

    game.removeNetPermissions('people');
    expect(entries(game)).toEqual({ playersmeta: {} });
  });
});
