import type { Game, NetPermissionRules } from '../game/Game';
import type { NetPermissions } from './NetPermissions';

/** Bits stored in `net.permissions` entries (`{ flags }`), keyed by `net.state` path. */
export const PERM_CLIENT_READ = 1 << 0;
export const PERM_CLIENT_WRITE = 1 << 1;

/** One key of a `net.state` path. */
export const NET_SEGMENT = /^[a-z0-9_]+$/i;
/** A whole dotted path, as a declaration may give it. */
export const NET_PATH = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i;
/**
 * The branch a lock or a queue keeps its backing under. A rule there would mean nothing: the host
 * resolves a write inside it against the object's own path.
 */
export const NET_OBJECT_MARK = '__netobj__';

/** The game's net rules read apart: the flags of each path that has a rule, and every path named. */
export interface NetRules {
  flags: ReadonlyMap<string, number>;
  declared: ReadonlySet<string>;
}

/** An entry without flags declares its path and leaves the rule to an ancestor. */
export function readNetRules(rules: NetPermissionRules): NetRules {
  const flags = new Map<string, number>();
  const declared = new Set<string>();
  rules.forEach((rule, path) => {
    declared.add(path);
    if (typeof rule.flags === 'number') {
      flags.set(path, rule.flags);
    }
  });
  return { flags, declared };
}

/** The path whose rule applies to `path`: itself, its nearest ancestor with one, or null for none. */
export function ruleOrigin(flags: ReadonlyMap<string, number>, path: string): string | null {
  for (let current = path; ; current = current.slice(0, Math.max(0, current.lastIndexOf('.')))) {
    if (flags.has(current)) {
      return current;
    }
    if (!current) {
      return null;
    }
  }
}

/**
 * The flags that apply to a path, or null when no rule reaches it. A root rule of 0 closes the
 * whole table rather than counting as unset.
 */
export function resolveFlags(flags: ReadonlyMap<string, number>, path: string): number | null {
  const origin = ruleOrigin(flags, path);
  return origin === null ? null : (flags.get(origin) ?? null);
}

/**
 * Adapts the game's per-path permission map to the runtime port the host
 * enforces. Allow-by-default: paths with no configured ancestor are open.
 *
 * The map is read on every check, not snapshotted: the running game holds this object for the
 * whole session, and its rules can be edited meanwhile.
 */
export function netPermissionsOf(game: Game): NetPermissions {
  return {
    canClientRead: (path) => {
      const flags = resolveFlags(readNetRules(game.netPermissions).flags, path);
      return flags === null ? true : (flags & PERM_CLIENT_READ) !== 0;
    },
    canClientWrite: (path) => {
      const flags = resolveFlags(readNetRules(game.netPermissions).flags, path);
      return flags === null ? true : (flags & PERM_CLIENT_WRITE) !== 0;
    },
  };
}

/** Whether clients may read and write a path, with no rule anywhere meaning open. */
export function accessAt(
  flags: ReadonlyMap<string, number>,
  path: string,
): { read: boolean; write: boolean } {
  const found = resolveFlags(flags, path);
  return {
    read: found === null || (found & PERM_CLIENT_READ) !== 0,
    write: found === null || (found & PERM_CLIENT_WRITE) !== 0,
  };
}

/** The flags that state an access. */
export const flagsOf = (access: { read: boolean; write: boolean }): number =>
  (access.read ? PERM_CLIENT_READ : 0) | (access.write ? PERM_CLIENT_WRITE : 0);
