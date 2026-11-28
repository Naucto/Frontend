// Build the existing engine as a self-contained npm dependency for Node consumers.
// No registry credentials or frontend checkout are needed to install the resulting archive.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
for (const [format, extension] of [
  ['esm', 'js'],
  ['cjs', 'cjs'],
]) {
  await build({
    absWorkingDir: root,
    entryPoints: ['src/headless.ts', 'src/sound.ts'],
    outdir: 'dist',
    bundle: true,
    platform: 'node',
    target: 'node22',
    format,
    outExtension: { '.js': `.${extension}` },
    packages: 'external',
  });
}
execFileSync('tsc', ['-p', 'tsconfig.package.json'], { cwd: root, stdio: 'inherit' });
// Both module systems must work without any browser globals.
for (const entry of ['headless', 'sound']) {
  execFileSync(
    process.execPath,
    ['--input-type=module', '-e', `await import('./dist/${entry}.js')`],
    { cwd: root, stdio: 'inherit' },
  );
  execFileSync(process.execPath, ['-e', `require('./dist/${entry}.cjs')`], {
    cwd: root,
    stdio: 'inherit',
  });
}
// Stage a manifest with an immutable source revision and no frontend lifecycle scripts.
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
manifest.version = `${manifest.version}-node.${source.slice(0, 12)}`;
manifest.main = './headless.cjs';
manifest.types = './types/headless.d.ts';
manifest.typesVersions = {
  '*': { headless: ['types/headless.d.ts'], sound: ['types/sound.d.ts'] },
};
manifest.license = 'GPL-3.0';
manifest.exports = Object.fromEntries(
  ['headless', 'sound'].map((name) => [
    `./${name}`,
    { types: `./types/${name}.d.ts`, import: `./${name}.js`, require: `./${name}.cjs` },
  ]),
);
manifest.engineSource = { repository: 'https://github.com/Naucto/Frontend', commit: source };
manifest.scripts = {};
manifest.dependencies = {
  yjs: manifest.dependencies.yjs,
  luaparse: manifest.dependencies.luaparse,
};
manifest.devDependencies = {};
writeFileSync(resolve(root, 'dist/package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync(
  'npm',
  ['pack', './dist', '--ignore-scripts', '--pack-destination', process.env.NAUCTO_PACK_DIR || root],
  { cwd: root, stdio: 'inherit' },
);
