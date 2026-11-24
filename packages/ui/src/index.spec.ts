import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'vitest';

// A name passed on with `export { X } from` makes the barrel part of whatever imports X, and the
// bundler then puts every kit file in the chunk all pages share.
it('passes every name on with `export * from`', () => {
  const lines = readFileSync(resolve(import.meta.dirname, 'index.ts'), 'utf8')
    .split('\n')
    .filter(Boolean);
  expect(lines.filter((line) => !/^export \* from '\.\/[\w./-]+';$/.test(line))).toEqual([]);
});
