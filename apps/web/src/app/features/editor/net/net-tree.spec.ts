import { type TableScalar } from '@naucto/engine';
import { describe, expect, it } from 'vitest';

import { PERM_CLIENT_READ, PERM_CLIENT_WRITE } from '../../../core/net/net-permissions';
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
    selfPlayer: 1,
    getValue: (path) => values[path],
    isContainer: (path) => paths.some((candidate) => candidate.startsWith(`${path}.`)),
    childKeys,
    objectKindAt: () => undefined,
    lockOwner: (path) => options.locks?.[path] ?? null,
  };
}

const build = (
  session: TreeSession | null,
  entries: Record<string, number | null> = {},
  query = '',
  collapsed: string[] = [],
): Row[] => {
  // null declares a path without a rule, as an entry without flags does.
  const flags = new Map<string, number>();
  for (const [path, value] of Object.entries(entries)) {
    if (value !== null) {
      flags.set(path, value);
    }
  }
  return buildRows({
    session,
    rules: { flags, declared: new Set(Object.keys(entries)) },
    query,
    collapsed: new Set(collapsed),
    entries: (count) => `${String(count)} entries`,
  });
};

const summary = (rows: Row[]): string[] =>
  rows.map((row) => `${'  '.repeat(row.depth)}${row.key} = ${row.value}`);

const rules = (rows: Row[]): string[] =>
  rows.map(
    (row) =>
      `${row.path || '<root>'} ${row.rule}${row.from === null ? '' : ` ${row.from || '<root>'}`}`,
  );

describe('buildRows', () => {
  it('draws the root alone, open by default, when nothing is running and nothing is declared', () => {
    expect(build(null)).toEqual([
      {
        path: '',
        depth: 0,
        key: '<root>',
        container: true,
        rule: 'none',
        from: null,
        read: true,
        write: true,
        live: false,
        declared: true,
        value: '—',
        kind: 'table',
        owner: null,
      },
    ]);
  });

  it('tells a rule of its own from one inherited and from none', () => {
    const rows = build(null, {
      players: PERM_CLIENT_READ,
      'players.score': null,
      'players.name': PERM_CLIENT_READ | PERM_CLIENT_WRITE,
      winner: null,
    });
    expect(rules(rows)).toEqual([
      '<root> none',
      'players own',
      'players.score inherited players',
      'players.name own',
      'winner none',
    ]);
    expect(rows[2]).toMatchObject({ read: true, write: false, declared: true, live: false });
    expect(rows[4]).toMatchObject({ read: true, write: true });
  });

  it('inherits from the root, and from an ancestor no entry names', () => {
    const rows = build(null, { '': 0, 'world.seed': null });
    expect(rules(rows)).toEqual([
      '<root> own',
      'world inherited <root>',
      'world.seed inherited <root>',
    ]);
    expect(rows[1]).toMatchObject({ declared: true, read: false, write: false });
  });

  it('adds what a session holds, greyed where the document does not name it', () => {
    const rows = build(sessionOf({ score: 1.5, name: '' }), { 'player.hp': PERM_CLIENT_READ });
    expect(summary(rows)).toEqual([
      '<root> = table',
      '  player = —',
      '    hp = —',
      '  score = 1.5',
      '  name = ""',
    ]);
    expect(rows.map((row) => [row.path, row.declared, row.live])).toEqual([
      ['', true, true],
      ['player', true, false],
      ['player.hp', true, false],
      ['score', false, true],
      ['name', false, true],
    ]);
    expect(rows[3]).toMatchObject({ kind: 'number', rule: 'none' });
  });

  it('counts the entries of a live container', () => {
    const rows = build(sessionOf({ 'player.hp': 3, 'player.mp': 4 }), { player: null });
    expect(summary(rows)).toEqual([
      '<root> = table',
      '  player = 2 entries',
      '    hp = 3',
      '    mp = 4',
    ]);
    expect(rows[1]).toMatchObject({ declared: true, live: true });
  });

  it('names the lock holder, or the host for any other live path', () => {
    const rows = build(sessionOf({ score: 1, door: true }, { isHost: true, locks: { door: 7 } }));
    expect(rows.map((row) => row.owner)).toEqual([null, 1, 7]);
  });

  it('keeps the root through a filter and stops at a folded container', () => {
    const session = sessionOf({ 'player.hp': 3, 'player.mp': 4, score: 1 });
    expect(summary(build(session, {}, 'MP'))).toEqual(['<root> = table', '    mp = 4']);
    expect(summary(build(session, {}, '', ['player']))).toEqual([
      '<root> = table',
      '  player = 2 entries',
      '  score = 1',
    ]);
  });
});
