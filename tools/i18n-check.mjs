#!/usr/bin/env node
/**
 * Compares the Transloco catalogue with the keys the code asks for.
 *
 * A missing key is invisible at runtime: Transloco's default handler returns the key itself, so the
 * UI paints `editor.game.versionNothingToSave` where a sentence belongs and nothing is logged in a
 * production build. That has reached testers twice. This is the check that would have caught it.
 *
 * Keys built at runtime (`t('docs.sections.' + p.section)`) cannot be resolved statically; their
 * prefixes are collected and anything under one is treated as reachable.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const CATALOGUE = join(ROOT, 'apps/web/public/i18n/en.json');
const SOURCES = ['apps/web/src', 'packages/ui/src'];

/** Every leaf of the nested catalogue, as its dotted path. */
function leaves(node, prefix = '') {
  return Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === 'object' ? leaves(value, `${prefix}${key}.`) : [`${prefix}${key}`],
  );
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.ts') || path.endsWith('.html')) yield path;
  }
}

// `t('a.b')`, `translate('a.b')`, `'a.b' | transloco` — and the same with a concatenation or a
// template hole after the dot, which is a prefix rather than a key.
const LITERAL = /(?:\bt|translate|translateObject|selectTranslate)\(\s*'([\w.]+)'/g;
const PREFIX = /(?:\bt|translate)\(\s*(?:'([\w.]+\.)'\s*\+|`([\w.]+\.)\$\{)/g;
const PIPE = /'([\w.]+)'\s*\|\s*transloco/g;

const used = new Set();
const prefixes = new Set();
for (const dir of SOURCES) {
  for (const file of walk(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8');
    // A key that ends on its dot is the head of a name completed at runtime, not a name.
    const keep = (key) => key.includes('.') && !key.endsWith('.');
    for (const [, key] of text.matchAll(LITERAL)) if (keep(key)) used.add(key);
    for (const [, key] of text.matchAll(PIPE)) if (keep(key)) used.add(key);
    for (const [, quoted, templated] of text.matchAll(PREFIX)) prefixes.add(quoted ?? templated);
  }
}

const defined = new Set(leaves(JSON.parse(readFileSync(CATALOGUE, 'utf8'))));
const missing = [...used].filter((key) => !defined.has(key)).sort();

// Only the missing half is reported. The other direction cannot be told honestly from here: a key
// chosen at runtime -- `t(syncLabel())`, where the signal returns one of four names -- is reachable
// and unfindable, so a list of "never asked for" would name keys the app paints every day. A check
// that cries wolf stops being run.
console.log(`i18n-check: ${defined.size} keys defined, ${used.size} asked for by name.`);
if (missing.length) {
  console.error(`\n${missing.length} asked for and never defined:`);
  for (const key of missing) console.error(`  ${key}`);
  console.error('\nThese paint as their own name in the UI. Add them to en.json.');
  process.exit(1);
}
console.log('\nNothing is asked for that the catalogue does not answer.');
