/**
 * Runner for `tools/seed-content.ts`.
 *
 * The seed has to build real game documents, which means importing `@naucto/engine` — and the
 * engine is published as TypeScript source with extensionless relative imports, which Node's own
 * type-stripping cannot resolve. esbuild is already in the tree for the audio worklet, so bundle
 * the script once and run the result rather than adding a TypeScript runner dependency.
 */
import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Inside node_modules, not /tmp: the bundle keeps its third-party imports external, so it has to
// sit somewhere Node's resolver can still find them from.
const dir = join('node_modules', '.cache', 'naucto-seed');
await mkdir(dir, { recursive: true });
try {
  const out = join(dir, 'seed-content.mjs');
  const result = await build({
    entryPoints: ['tools/seed-content.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    // Third-party packages stay external so we run the same yjs instance the app does. The engine
    // is imported by relative path in the script precisely so it lands *inside* the bundle, which
    // is what resolves its extensionless imports.
    packages: 'external',
    write: false,
  });
  await writeFile(out, result.outputFiles[0].text);
  await import(pathToFileURL(out).href);
} finally {
  await rm(dir, { recursive: true, force: true });
}
