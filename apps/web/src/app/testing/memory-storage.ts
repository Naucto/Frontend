/** A `Storage` over a Map, which is all a preference or a pending flow needs from one. */
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> {
  const mem = new Map<string, string>();
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => {
      mem.set(k, v);
    },
    removeItem: (k) => {
      mem.delete(k);
    },
    clear: () => {
      mem.clear();
    },
  };
}

/** Installs an in-memory */
export function installMemoryStorage(): void {
  (globalThis as { localStorage?: unknown }).localStorage = fakeStorage();
}

/** The OAuth flow's state lives in sessionStorage, which the runner has none of either. */
export function installSessionStorage(): Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'clear'
> {
  const fake = fakeStorage();
  Object.defineProperty(globalThis, 'sessionStorage', { value: fake, configurable: true });
  return fake;
}
