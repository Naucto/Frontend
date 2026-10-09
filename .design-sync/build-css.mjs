// Compiles the nc-* kit's Tailwind v4 source into the plain stylesheet Claude Design ships.
//
// tokens.css is Tailwind input (@theme, @utility), which a browser cannot read, so the sync
// ships its compiled output instead: the custom properties, the base and component layers,
// and every utility class the app and the kit actually use, scanned from their templates.
// That scan is the vocabulary the design agent is told it may write.
//
// Usage (from the Frontend root): node .design-sync/build-css.mjs  ->  .ds-sync/naucto.css

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, '.ds-sync', 'naucto.css');
const FONTS = join(ROOT, 'apps/web/public/fonts');
const require = createRequire(join(ROOT, 'package.json'));
const { compile, optimize } = require('@tailwindcss/node');
const { Scanner } = require('@tailwindcss/oxide');

const tokens = join(ROOT, 'packages/ui/src/tokens.css');
const input = `@import 'tailwindcss';\n@import '${tokens}';\n`;

const compiler = await compile(input, { base: ROOT, onDependency: () => {} });
const scanner = new Scanner({
  sources: ['packages/ui/src', 'apps/web/src'].map((dir) => ({
    base: join(ROOT, dir),
    pattern: '**/*.{html,ts}',
    negated: false,
  })),
});
let css = compiler.build(scanner.scan());

// The app serves the faces from /fonts at runtime; point at the files themselves so the
// converter can copy them into the bundle.
const fontsRel = relative(dirname(OUT), FONTS);
css = css.replace(/url\((['"]?)\/fonts\//g, `url($1${fontsRel}/`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, optimize(css, { minify: false }).code);
console.log(`wrote ${relative(ROOT, OUT)} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB)`);
