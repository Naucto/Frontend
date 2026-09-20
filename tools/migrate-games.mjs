/**
 * Builds `tools/migrate-games.ts` into `dist-tools/migrate-games.cjs`: one file to copy into the
 * Backend image. `pg` and `@aws-sdk/client-s3` stay external because they already live under
 * `/app/node_modules` there and are not dependencies of this repo; the engine and its yjs travel
 * inside the bundle, which is also what resolves the engine's extensionless relative imports.
 */
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

await mkdir('dist-tools', { recursive: true });
await build({
  entryPoints: ['tools/migrate-games.ts'],
  outfile: 'dist-tools/migrate-games.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['pg', '@aws-sdk/client-s3'],
  // A CommonJS bundle has no `import.meta`; the file's own path is exactly what `createRequire`
  // needs to resolve the externals from `/app/node_modules`.
  define: { 'import.meta.url': '__filename' },
  logLevel: 'info',
});
