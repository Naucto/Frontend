/**
 * Runs a TypeScript tool (`node tools/run-ts.mjs tools/x.ts [args…]`): bundled by esbuild because
 * the engine's extensionless imports defeat Node's type stripping. The tool sees its own arguments
 * from `process.argv[2]` on.
 */
import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [entry] = process.argv.splice(2, 1);
if (!entry) {
  console.error('usage: node tools/run-ts.mjs <entry.ts> [args…]');
  process.exit(2);
}

// Inside node_modules, not /tmp: the bundle keeps its third-party imports external, so it has to
// sit somewhere Node's resolver can still find them from.
const dir = join('node_modules', '.cache', `naucto-run-${basename(entry, '.ts')}`);
await mkdir(dir, { recursive: true });
try {
  const out = join(dir, 'bundle.mjs');
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    // Packages stay external to share the app's yjs instance; the engine, imported by relative
    // path, is bundled.
    packages: 'external',
    write: false,
  });
  await writeFile(out, result.outputFiles[0].text);
  await import(pathToFileURL(out).href);
} finally {
  await rm(dir, { recursive: true, force: true });
}
