import { type Game, type NetPermissions } from '@naucto/engine';

/** Bits stored in `net.permissions` entries (`{ flags }`), keyed by `net.state` path. */
export const PERM_CLIENT_READ = 1 << 0;
export const PERM_CLIENT_WRITE = 1 << 1;

/** The permission record that applies to a path: its own, or the nearest configured ancestor's. */
export function resolveFlags(entries: ReadonlyMap<string, number>, path: string): number | null {
  let current = path;
  for (;;) {
    const flags = entries.get(current);
    if (flags !== undefined) {
      return flags;
    }
    const i = current.lastIndexOf('.');
    if (i < 0) {
      break;
    }
    current = current.slice(0, i);
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
 * The map is read on every check, not snapshotted: the running game holds this object for the
 * whole session, and its rules can be edited meanwhile.
 */
export function netPermissionsOf(game: Game): NetPermissions {
  const read = (): ReadonlyMap<string, number> => {
    const out = new Map<string, number>();
    game.netPermissions.forEach((entry, path) => {
      out.set(path, entry.flags);
    });
    return out;
  };
  return {
    canClientRead: (path) => {
      const flags = resolveFlags(read(), path);
      return flags === null ? true : (flags & PERM_CLIENT_READ) !== 0;
    },
    canClientWrite: (path) => {
      const flags = resolveFlags(read(), path);
      return flags === null ? true : (flags & PERM_CLIENT_WRITE) !== 0;
    },
  };
}
