/** The runner has no DOM storage, and a preference is only a preference if it survives one. */
export function installMemoryStorage(): void {
  const mem = new Map<string, string>();
  const fake: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> = {
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
  (globalThis as { localStorage?: unknown }).localStorage = fake;
}
