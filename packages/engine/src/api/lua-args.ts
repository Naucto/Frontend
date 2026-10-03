export const luaNumber = (v: unknown, d = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : d;
