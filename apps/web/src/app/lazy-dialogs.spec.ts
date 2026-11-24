import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

/**
 * A root service is in what every page loads, with everything it imports by value. A dialog it
 * opens is fetched with `import()` when it opens, and named before that by `import type` only.
 */
it('imports no dialog by value into a service provided in root', () => {
  const app = import.meta.dirname;
  const files = readdirSync(app, { recursive: true, encoding: 'utf8' }).filter(
    (path) => path.endsWith('.ts') && !path.endsWith('.spec.ts'),
  );
  const eager = files.filter((path) => {
    const source = readFileSync(join(app, path), 'utf8');

    return (
      source.includes("providedIn: 'root'") &&
      /^import (?!type\b)[^;]*\bfrom '[^']*\.dialog';/m.test(source)
    );
  });

  // Several hundred today; a handful would mean the sources were not the ones read.
  expect(files.length).toBeGreaterThan(200);
  expect(eager).toEqual([]);
});
