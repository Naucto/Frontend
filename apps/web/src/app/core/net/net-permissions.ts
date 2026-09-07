import { type Game, type NetPermissions } from '@naucto/engine';

/** Bits stored in `net.permissions` entries (`{ flags }`), keyed by `net.state` path. */
export const PERM_CLIENT_READ = 1 << 0;
export const PERM_CLIENT_WRITE = 1 << 1;

/** The permission record that applies to a path: its own, or the nearest configured ancestor's. */
export function resolveFlags(entries: ReadonlyMap<string, number>, path: string): number | null {
  let p = path;
  for (;;) {
    const f = entries.get(p);
    if (f !== undefined) return f;
    const i = p.lastIndexOf('.');
    if (i < 0) break;
    p = p.slice(0, i);
  }
  // A root entry of 0 means "deny read and write everywhere" — treating it as "unset" would open
  // the whole table instead of closing it.
  const root = entries.get('');
  return root ?? null;
}

/**
 * Adapts the game's per-path permission map to the runtime port the host
 * enforces. Allow-by-default: paths with no configured ancestor are open.
 *
 * The map is read on every check rather than snapshotted: the running game holds this object for
 * the whole session, so returning a frozen ALLOW_ALL for a game that happens to have no rules yet
 * would make every toggle in the NET tab inert until the game was remounted.
 */
export function netPermissionsOf(game: Game): NetPermissions {
  const read = (): ReadonlyMap<string, number> => {
    const out = new Map<string, number>();
    game.netPermissions.forEach((v, k) => {
      out.set(k, v.flags);
    });
    return out;
  };
  return {
    canClientRead: (path) => {
      const f = resolveFlags(read(), path);
      return f === null ? true : (f & PERM_CLIENT_READ) !== 0;
    },
    canClientWrite: (path) => {
      const f = resolveFlags(read(), path);
      return f === null ? true : (f & PERM_CLIENT_WRITE) !== 0;
    },
  };
}
