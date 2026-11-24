import { EditableGame } from '@naucto/engine';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  netPermissionsOf,
  PERM_CLIENT_READ,
  PERM_CLIENT_WRITE,
  readNetRules,
  resolveFlags,
  ruleOrigin,
} from './net-permissions';

const READ_WRITE = PERM_CLIENT_READ | PERM_CLIENT_WRITE;

describe('the net rules of a game', () => {
  it('reads an entry without flags as a declaration, not as a rule', () => {
    const game = new EditableGame(new Y.Doc());
    game.setNetPermission('players', PERM_CLIENT_READ);
    game.declareNetPath('players.score');

    const rules = readNetRules(game.netPermissions);
    expect([...rules.flags]).toEqual([['players', PERM_CLIENT_READ]]);
    expect([...rules.declared].sort()).toEqual(['players', 'players.score']);
  });

  it('takes a path rule from itself, then its nearest ancestor with one, then none', () => {
    const flags = new Map([
      ['players', PERM_CLIENT_READ],
      ['players.name', READ_WRITE],
    ]);
    expect(ruleOrigin(flags, 'players.name')).toBe('players.name');
    expect(ruleOrigin(flags, 'players.score.best')).toBe('players');
    expect(ruleOrigin(flags, 'world')).toBeNull();
    expect(resolveFlags(flags, 'players.score')).toBe(PERM_CLIENT_READ);
    expect(resolveFlags(flags, 'world')).toBeNull();
  });

  it('closes the whole table on a root rule of 0', () => {
    const flags = new Map([['', 0]]);
    expect(ruleOrigin(flags, 'anything.below')).toBe('');
    expect(resolveFlags(flags, 'anything.below')).toBe(0);
  });

  it('lets the host apply an inherited rule, and the parent rule again once a path inherits', () => {
    const game = new EditableGame(new Y.Doc());
    const perms = netPermissionsOf(game);
    game.setNetPermission('players', PERM_CLIENT_READ);
    game.declareNetPath('players.score');
    expect(perms.canClientRead('players.score')).toBe(true);
    expect(perms.canClientWrite('players.score')).toBe(false);

    game.setNetPermission('players.score', READ_WRITE);
    expect(perms.canClientWrite('players.score')).toBe(true);

    game.inheritNetPermission('players.score');
    expect(perms.canClientWrite('players.score')).toBe(false);
    expect(readNetRules(game.netPermissions).declared.has('players.score')).toBe(true);
  });

  it('reads a document written before declarations as it always did', () => {
    const game = new EditableGame(new Y.Doc());
    game.setNetPermission('players', PERM_CLIENT_READ);
    game.setNetPermission('players.name', READ_WRITE);
    const perms = netPermissionsOf(game);

    expect(perms.canClientWrite('players.name')).toBe(true);
    expect(perms.canClientWrite('players.score')).toBe(false);
    expect(perms.canClientWrite('world')).toBe(true);
  });
});
