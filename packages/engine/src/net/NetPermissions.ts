// Per-path access control for net.state, enforced by the host. "Client" means a
// slave (a joined peer); the host is the authority and is never restricted by
// these checks (SERVER_* is reserved). Semantics are allow-by-default: an
// unconfigured path is fully readable and writable, so games without any
// configured permissions behave exactly as before.
export interface NetPermissions {
  // May a client write this path? When false the host rejects the write (nack).
  canClientWrite(path: string): boolean;

  // May a client receive this path? When false the host withholds it from
  // broadcasts and snapshots, keeping it server-private.
  canClientRead(path: string): boolean;
}

// The default when a session has no permissions configured: everything allowed.
export const ALLOW_ALL: NetPermissions = {
  canClientWrite: () => true,
  canClientRead: () => true,
};

/** What a net.state entry can hold. Scalars only: a table is its own leaves. */
export type NetScalar = number | string | boolean;

/**
 * One declaration in the game document: which clients may reach this path, and what a session
 * starts it at.
 *
 * The default is the authored starting value, not the live one. A running session owns its values
 * and they are not versioned; this is what a fresh session begins with, so a declaration can be
 * reviewed, reverted and diffed like the rest of the document, while a game in progress is left
 * alone.
 */
export interface NetDeclaration {
  flags: number;
  default?: NetScalar;
}

/**
 * The branch a lock or queue keeps its backing under, and the one name no declaration may use.
 *
 * `SharedTableSession` stores an object's type, its lock owner and its queue in
 * `P.__netobj__.*` and resolves permissions against the *owner's* path, so a declaration here would
 * be two things at once: a value seeded into the host's store where the lock machinery reads it
 * (an owner written there deadlocks the first acquisition, permanently), and a permission nobody
 * consults. It is not a path a person or an assistant may name.
 */
export const NET_RESERVED_SEGMENT = '__netobj__';

/** One key of a path. */
const SEGMENT = /^[a-z0-9_]+$/i;

/**
 * A whole path, which a declaration may give at once: building `players.score` a segment at a time
 * means declaring a node only to reopen it, and the name people say out loud is the dotted one.
 */
const PATH = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/i;

/** The longest declaration the document will hold, so a path cannot become a payload. */
export const NET_PATH_MAX = 128;

export const isNetSegment = (value: string): boolean =>
  value.length > 0 && value.length <= 64 && value !== NET_RESERVED_SEGMENT && SEGMENT.test(value);

/**
 * Whether a string is a shape a net.state declaration may be keyed by. The empty string is
 * deliberately not one: a root entry of `0` is how a game closes the whole table, and it is
 * written by the resolver, not declared as a path.
 */
export const isNetPath = (value: string): boolean =>
  value.length > 0 &&
  value.length <= NET_PATH_MAX &&
  PATH.test(value) &&
  // A whole path may be given in one go, so the bound is on the composed name, not on a key.
  value.split('.').every(isNetSegment);
