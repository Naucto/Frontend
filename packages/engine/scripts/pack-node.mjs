// Build the existing engine as a self-contained npm dependency for Node consumers.
// No registry credentials or frontend checkout are needed to install the resulting archive.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ENTRIES = ['headless', 'sound', 'runtime'];
// The reference a tool reads is the one the site shows, built from the same engine.
const docsIndex = resolve(root, '../../apps/web/public/docs/index.json');
if (!existsSync(docsIndex)) {
  throw new Error('Build the reference first: npm run docs:build');
}
const source = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
for (const [format, extension] of [
  ['esm', 'js'],
  ['cjs', 'cjs'],
]) {
  await build({
    absWorkingDir: root,
    entryPoints: ENTRIES.map((name) => `src/${name}.ts`),
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
// The reference as text: what a page says and what each function takes, without the site's markup.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const plain = (html) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ENTITIES[name])
    .trim();
const { pages, manifest: reference } = JSON.parse(readFileSync(docsIndex, 'utf8'));
const docs = {
  entries: Object.values(reference.index).map((entry) => ({
    name: entry.name,
    kind: entry.kind,
    signature: entry.signature,
    summary: plain(entry.summary),
    description: plain(entry.descriptionHtml),
    params: (entry.params ?? []).map(({ name, type, optional, description }) => ({
      name,
      type,
      optional,
      description: plain(description),
    })),
    returns: entry.returnType ?? null,
    examples: (entry.examples ?? []).map((example) => example.code),
  })),
  pages: pages.map(({ slug, title, description, sections }) => ({
    slug,
    title,
    description: description ?? '',
    sections: (sections ?? []).map((section) => ({ title: section.title, text: section.text })),
  })),
};
const literal = JSON.stringify(docs);
writeFileSync(resolve(root, 'dist/docs.js'), `export const DOCS = ${literal};\n`);
writeFileSync(resolve(root, 'dist/docs.cjs'), `exports.DOCS = ${literal};\n`);
writeFileSync(
  resolve(root, 'dist/types/docs.d.ts'),
  `export interface DocEntry {
  name: string;
  kind: string;
  signature: string;
  summary: string;
  description: string;
  params: { name: string; type: string; optional: boolean; description: string }[];
  returns: string | null;
  examples: string[];
}
export interface DocPage {
  slug: string;
  title: string;
  description: string;
  sections: { title: string; text: string }[];
}
export declare const DOCS: { entries: DocEntry[]; pages: DocPage[] };
`,
);
// Both module systems must work without any browser globals.
for (const entry of ENTRIES) {
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
  '*': Object.fromEntries([...ENTRIES, 'docs'].map((name) => [name, [`types/${name}.d.ts`]])),
};
manifest.license = 'GPL-3.0';
manifest.exports = Object.fromEntries(
  [...ENTRIES, 'docs'].map((name) => [
    `./${name}`,
    { types: `./types/${name}.d.ts`, import: `./${name}.js`, require: `./${name}.cjs` },
  ]),
);
manifest.engineSource = { repository: 'https://github.com/Naucto/Frontend', commit: source };
manifest.scripts = {};
manifest.dependencies = {
  yjs: manifest.dependencies.yjs,
  luaparse: manifest.dependencies.luaparse,
  fengari: manifest.dependencies.fengari,
};
manifest.devDependencies = {};
writeFileSync(resolve(root, 'dist/package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
execFileSync(
  'npm',
  ['pack', './dist', '--ignore-scripts', '--pack-destination', process.env.NAUCTO_PACK_DIR || root],
  { cwd: root, stdio: 'inherit' },
);
