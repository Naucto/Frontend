import { type SharedTableSession, type TableScalar } from '@naucto/engine';
import { type NetRules, PERM_CLIENT_READ, PERM_CLIENT_WRITE, ruleOrigin } from '@naucto/engine';
import { formatCount } from '@naucto/ui';

/** Where a path's flags come from: a rule of its own, an ancestor's, or no rule anywhere (open). */
export type RuleSource = 'own' | 'inherited' | 'none';

export interface Row {
  path: string;
  depth: number;
  /** The last key of the path, since the indent already says where it sits. */
  key: string;
  container: boolean;
  rule: RuleSource;
  /** The path whose rule an inherited row takes; '' is the root. */
  from: string | null;
  read: boolean;
  write: boolean;
  /** Whether a running session holds this path. */
  live: boolean;
  /** Whether the document names this path, or a path under it. */
  declared: boolean;
  value: string;
  kind: 'number' | 'string' | 'boolean' | 'table' | 'object';
  owner: number | null;
}

/** What of a running session the tree reads. */
export type TreeSession = Pick<
  SharedTableSession,
  'isHost' | 'selfPlayer' | 'getValue' | 'isContainer' | 'childKeys' | 'objectKindAt' | 'lockOwner'
>;

/**
 * The design's value column is a Lua literal, not a `toString()`: strings keep their quotes so an
 * empty one is visible, and long numbers are grouped so a score is readable at a glance.
 */
function formatScalar(value: TableScalar | undefined): string {
  if (value === undefined || value === null) {
    return 'nil';
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? formatCount(value) : String(value);
  }
  return String(value);
}

/** A dotted path and every ancestor of it below the root, shortest first. */
function withAncestors(path: string): string[] {
  const parts = path.split('.');
  return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
}

/** Every path a running session holds, containers included. */
function livePaths(session: TreeSession): string[] {
  const out: string[] = [];
  const walk = (path: string): void => {
    for (const key of session.childKeys(path)) {
      const child = path ? `${path}.${key}` : key;
      out.push(child);
      if (session.isContainer(child) && !session.objectKindAt(child)) {
        walk(child);
      }
    }
  };
  walk('');
  return out;
}

/**
 * The rules table, depth first: every path the document names, each ancestor they imply, and every
 * path a running session holds, with where its flags come from and what it holds now. Filtered by
 * `query` and folded at `collapsed`; the root is always there, since a first path is added under it.
 */
export function buildRows(tree: {
  session: TreeSession | null;
  rules: NetRules;
  query: string;
  collapsed: ReadonlySet<string>;
  /** The value shown for a container of `count` children. */
  entries: (count: number) => string;
}): Row[] {
  const { session, collapsed } = tree;
  const { flags: perms } = tree.rules;
  const declared = new Set(
    [...tree.rules.declared].filter(Boolean).flatMap((path) => withAncestors(path)),
  );
  const all = new Set([...declared, ...(session ? livePaths(session) : [])]);
  const children = new Map<string, string[]>();
  for (const path of all) {
    const parent = path.slice(0, Math.max(0, path.lastIndexOf('.')));
    children.set(parent, [...(children.get(parent) ?? []), path]);
  }
  const query = tree.query.trim().toLowerCase();
  const out: Row[] = [];
  const visit = (path: string, depth: number): void => {
    const root = path === '';
    const kids = children.get(path) ?? [];
    const origin = ruleOrigin(perms, path);
    const flags = origin === null ? null : (perms.get(origin) ?? null);
    const liveContainer = !!session && (root || session.isContainer(path));
    const scalar = !session || liveContainer ? undefined : session.getValue(path);
    const live = !!session && (root || liveContainer || scalar !== undefined);
    const objectKind = !root && session ? session.objectKindAt(path) : undefined;

    let value = '—';
    let kind: Row['kind'] = 'table';
    if (objectKind) {
      value = objectKind;
      kind = 'object';
    } else if (live && root) {
      value = 'table';
    } else if (live && liveContainer) {
      value = tree.entries(session.childKeys(path).length);
    } else if (live) {
      value = formatScalar(scalar);
      kind = typeof scalar as Row['kind'];
    }

    // A lock names who holds it; any other live path below the root is written by the host.
    let owner: number | null = null;
    if (!root && session && live) {
      owner = session.lockOwner(path) ?? (session.isHost ? session.selfPlayer : null);
    }

    if (root || !query || path.toLowerCase().includes(query)) {
      out.push({
        path,
        depth,
        key: root ? '<root>' : path.slice(path.lastIndexOf('.') + 1),
        container: root || kids.length > 0,
        rule: origin === path ? 'own' : origin === null ? 'none' : 'inherited',
        from: origin === path ? null : origin,
        read: flags === null || (flags & PERM_CLIENT_READ) !== 0,
        write: flags === null || (flags & PERM_CLIENT_WRITE) !== 0,
        live,
        declared: root || declared.has(path),
        value,
        kind,
        owner,
      });
    }
    if (!collapsed.has(path)) {
      for (const kid of kids) {
        visit(kid, depth + 1);
      }
    }
  };
  visit('', 0);
  return out;
}
