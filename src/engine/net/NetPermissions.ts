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
