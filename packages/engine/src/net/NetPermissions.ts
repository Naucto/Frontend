// Per-path access control for net.state, enforced by the host on joined peers only; an unconfigured
// path is readable and writable.
export interface NetPermissions {
  // May a client write this path? When false the host rejects the write (nack).
  canClientWrite(path: string): boolean;

  // May a client receive this path? When false the host withholds it from
  // broadcasts and snapshots, keeping it server-private.
  canClientRead(path: string): boolean;
}

export const ALLOW_ALL: NetPermissions = {
  canClientWrite: () => true,
  canClientRead: () => true,
};
