/** A `Storage` over a Map, which is all a preference or a pending flow needs from one. */
function fakeStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> {
  const mem = new Map<string, string>();
  return {
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => {
      mem.set(key, value);
    },
    removeItem: (key) => {
      mem.delete(key);
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
