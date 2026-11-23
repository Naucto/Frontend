import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { expect, it } from 'vitest';

/** Every `.ts` under a directory that is not a spec. */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }

    return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/**
 * A transaction opened on the document itself goes round the game's gate, and so round the
 * editor's mode. One is meant to: the session writing the project's fields into the document as
 * it opens, which is a load and nobody's edit. Everything else goes through `game.transact`.
 */
it('opens a transaction on the game document in the session load, nowhere else in the app', () => {
  const app = join(import.meta.dirname, '..', '..');
  const files = sources(app);
  const found = files.flatMap((path) =>
    (readFileSync(path, 'utf8').match(/\bdoc\??\.transact\(/g) ?? []).map(() =>
      relative(app, path),
    ),
  );

  // Several hundred today; a handful would mean the sources were not the ones read.
  expect(files.length).toBeGreaterThan(200);
  expect(found).toEqual(['features/editor/work-session/work-session.service.ts']);
});
