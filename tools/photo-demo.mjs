/**
 * Runner for `tools/photo-demo.ts`, the same way `seed-content.mjs` runs its script: the
 * generator imports `./png-decode` extensionless, which Node's type stripping cannot resolve, so
 * esbuild bundles it once and the bundle is what runs.
 */
import { build } from 'esbuild';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = join('node_modules', '.cache', 'naucto-photo-demo');
await mkdir(dir, { recursive: true });
try {
  const out = join(dir, 'photo-demo.mjs');
  const result = await build({
    entryPoints: ['tools/photo-demo.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    packages: 'external',
    write: false,
  });
  await writeFile(out, result.outputFiles[0].text);
  await import(pathToFileURL(out).href);
} finally {
  await rm(dir, { recursive: true, force: true });
}
