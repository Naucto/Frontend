// The kit's tokens are Tailwind source, which a browser cannot read, so the sync ships them
// compiled. Utilities are generated only for the classes the kit and the app use, which makes
// the stylesheet the exact vocabulary the design agent may write, and nothing beyond it.

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

// The app resolves the faces against its served root, which does not exist on disk; the
// converter copies only fonts it can read from a file path.
const fontsRel = relative(dirname(OUT), FONTS);
css = css.replace(/url\((['"]?)\/fonts\//g, `url($1${fontsRel}/`);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, optimize(css, { minify: false }).code);
console.log(`wrote ${relative(ROOT, OUT)} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB)`);
