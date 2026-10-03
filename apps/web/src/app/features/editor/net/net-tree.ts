import { type SharedTableSession, type TableScalar } from '@naucto/engine';
import { formatCount } from '@naucto/ui';

import {
  PERM_CLIENT_READ,
  PERM_CLIENT_WRITE,
  resolveFlags,
} from '../../../core/net/net-permissions';

export interface Row {
  path: string;
  depth: number;
  name: string;
  container: boolean;
  value: string;
  kind: 'number' | 'string' | 'boolean' | 'table' | 'object';
  owner: number | null;
  read: boolean;
  write: boolean;
  /** Whether a running session has this path, as against the document merely declaring it. */
  live: boolean;
}

/** What of a running session the tree reads. */
export type TreeSession = Pick<
  SharedTableSession,
  'isHost' | 'selfUserId' | 'getValue' | 'isContainer' | 'childKeys' | 'objectKindAt' | 'lockOwner'
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

/**
 * Every path the permissions name, with each ancestor it implies, as parent → child keys: a path
 * that carries a permission is a node even when no session has put a value there.
 */
function declaredChildren(perms: ReadonlyMap<string, number>): Map<string, Set<string>> {
  const declared = new Map<string, Set<string>>();
  for (const path of perms.keys()) {
    if (!path) {
      continue;
    }
    const parts = path.split('.');
    for (let i = 0; i < parts.length; i++) {
      const parent = parts.slice(0, i).join('.');
      let kids = declared.get(parent);
      if (!kids) {
        declared.set(parent, (kids = new Set<string>()));
      }
      kids.add(parts[i] ?? '');
    }
  }
  return declared;
}

/**
 * The tree as the table draws it, depth first: what the session holds merged with what the
 * document declares, filtered by `query` and folded at `collapsed`. The root is always there,
 * whatever the filter, since it is what a first path is added under.
 */
export function buildRows(tree: {
  session: TreeSession | null;
  /** The document's permission flags, by path. */
  perms: ReadonlyMap<string, number>;
  query: string;
  collapsed: ReadonlySet<string>;
  /** The value shown for a container of `count` children. */
  entries: (count: number) => string;
}): Row[] {
  const { session, perms, collapsed } = tree;
  const declared = declaredChildren(perms);
  const query = tree.query.trim().toLowerCase();
  const out: Row[] = [];
  const visit = (path: string, depth: number): void => {
    const root = path === '';
    const liveContainer = session !== null && (root || session.isContainer(path));
    const scalar = liveContainer || session === null ? undefined : session.getValue(path);
    const live = session !== null && (root || liveContainer || scalar !== undefined);
    const keys = [
      ...new Set([
        ...(liveContainer ? session.childKeys(path) : []),
        ...(declared.get(path) ?? []),
      ]),
    ];
    const container = root || liveContainer || keys.length > 0;
    const objectKind = !root && session ? session.objectKindAt(path) : undefined;

    let value: string;
    let kind: Row['kind'] = 'table';
    if (objectKind) {
      value = objectKind;
      kind = 'object';
    } else if (root) {
      value = 'table';
    } else if (container) {
      value = tree.entries(keys.length);
    } else if (live) {
      value = formatScalar(scalar);
      kind = typeof scalar as Row['kind'];
    } else {
      // A dash, not nil: a declared node no session has reached has no value yet.
      value = '—';
    }

    // A lock names who holds it; any other live path below the root is written by the host.
    let owner: number | null = null;
    if (!root && session && live) {
      owner = session.lockOwner(path) ?? (session.isHost ? session.selfUserId : null);
    }

    const flags = resolveFlags(perms, path);
    if (root || !query || path.toLowerCase().includes(query)) {
      out.push({
        path,
        depth,
        name: root ? '<root>' : path,
        container,
        value,
        kind,
        owner,
        read: flags === null || (flags & PERM_CLIENT_READ) !== 0,
        write: flags === null || (flags & PERM_CLIENT_WRITE) !== 0,
        live,
      });
    }
    if (container && !collapsed.has(path)) {
      for (const key of keys) {
        visit(root ? key : `${path}.${key}`, depth + 1);
      }
    }
  };
  visit('', 0);
  return out;
}
