import { type TableScalar } from '@naucto/engine';
import { describe, expect, it } from 'vitest';

import { PERM_CLIENT_READ } from '../../../core/net/net-permissions';
import { buildRows, type Row, type TreeSession } from './net-tree';

/** A session holding `values` at their dotted paths, every ancestor of one a container. */
function sessionOf(
  values: Record<string, TableScalar>,
  options: { isHost?: boolean; locks?: Record<string, number> } = {},
): TreeSession {
  const paths = Object.keys(values);
  const childKeys = (path: string): string[] => {
    const prefix = path ? `${path}.` : '';
    return [
      ...new Set(
        paths
          .filter((candidate) => candidate.startsWith(prefix))
          .map((candidate) => candidate.slice(prefix.length).split('.')[0] ?? ''),
      ),
    ];
  };
  return {
    isHost: options.isHost ?? false,
    selfUserId: 1,
    getValue: (path) => values[path],
    isContainer: (path) => paths.some((candidate) => candidate.startsWith(`${path}.`)),
    childKeys,
    objectKindAt: () => undefined,
    lockOwner: (path) => options.locks?.[path] ?? null,
  };
}

const build = (
  session: TreeSession | null,
  perms: Record<string, number> = {},
  query = '',
  collapsed: string[] = [],
): Row[] =>
  buildRows({
    session,
    perms: new Map(Object.entries(perms)),
    query,
    collapsed: new Set(collapsed),
    entries: (count) => `${String(count)} entries`,
  });

const summary = (rows: Row[]): string[] =>
  rows.map((row) => `${'  '.repeat(row.depth)}${row.name} = ${row.value}`);

describe('buildRows', () => {
  it('draws the root alone when nothing is running and nothing is declared', () => {
    expect(build(null)).toEqual([
      {
        path: '',
        depth: 0,
        name: '<root>',
        container: true,
        value: 'table',
        kind: 'table',
        owner: null,
        read: true,
        write: true,
        live: false,
      },
    ]);
  });

  it('shows a declared path and its ancestors with no value yet', () => {
    const rows = build(null, { 'player.hp': PERM_CLIENT_READ });
    expect(summary(rows)).toEqual(['<root> = table', '  player = 1 entries', '    player.hp = —']);
    expect(rows[2]).toMatchObject({ live: false, read: true, write: false });
  });

  it('merges the live tree with the declared one, as Lua literals', () => {
    const rows = build(sessionOf({ score: 1.5, name: '' }), { 'player.hp': 3 });
    expect(summary(rows)).toEqual([
      '<root> = table',
      '  score = 1.5',
      '  name = ""',
      '  player = 1 entries',
      '    player.hp = —',
    ]);
    expect(rows[1]).toMatchObject({ kind: 'number', live: true });
  });

  it('names the lock holder, or the host for any other live path', () => {
    const rows = build(sessionOf({ score: 1, door: true }, { isHost: true, locks: { door: 7 } }));
    expect(rows.map((row) => row.owner)).toEqual([null, 1, 7]);
  });

  it('keeps the root through a filter and stops at a folded container', () => {
    const session = sessionOf({ 'player.hp': 3, 'player.mp': 4, score: 1 });
    expect(summary(build(session, {}, 'MP'))).toEqual(['<root> = table', '    player.mp = 4']);
    expect(summary(build(session, {}, '', ['player']))).toEqual([
      '<root> = table',
      '  player = 2 entries',
      '  score = 1',
    ]);
  });
});
