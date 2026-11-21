#!/usr/bin/env node
/**
 * Fails on what the pixel kit has no place for: a rounded corner, a stroke that is not a whole
 * number of 3px pixels, the density tokens the size ladder replaced, a "·" set between two
 * things on screen (in the catalogue, a template or a string; see `separators.mjs`), and an
 * `nc-icon` at a size it has no drawing for: 24 and 36 are the two it is drawn at, and its `svg`
 * is never resized from outside.
 *
 * `tools/pixel-allow.json` lists what each file still owes, rule by rule. A file may owe less than
 * its entry says, never more, and a file with no entry owes nothing. `--update` rewrites the entries
 * from what is found, which is how one shrinks after a screen is moved onto the kit.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { separators } from './separators.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const ALLOW = join(ROOT, 'tools/pixel-allow.json');
const SOURCES = ['packages/ui/src', 'apps/web/src'];
const CATALOGUES = 'apps/web/public/i18n';
const PIXEL = 3;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else if (/\.(ts|html|css)$/.test(path) && !path.endsWith('.spec.ts')) {
      yield path;
    }
  }
}

function offPixel(length) {
  return length !== 0 && length % PIXEL !== 0;
}

// A Tailwind class, with any variants in front of it (`hover:`, `md:`, `aria-checked:`).
const VARIANTS = String.raw`(?<![\w:-])(?:[\w-]+(?:\[[^\]\s]*\])?:)*`;
const ROUNDED = new RegExp(String.raw`${VARIANTS}rounded(?:-[\w\[\]./%-]+)?(?![\w-])`, 'g');
const SIDE = '(?:-[trblxyse])?';
const BARE_BORDER = new RegExp(String.raw`${VARIANTS}(?:border|divide)${SIDE}(?![\w-])`, 'g');
const SIZED_BORDER = new RegExp(
  String.raw`${VARIANTS}(?:border|divide|outline)${SIDE}-(?:(\d+)|\[(\d+(?:\.\d+)?)px\])(?![\w-])`,
  'g',
);
const CSS_STROKE =
  /(?<![\w-])(?:border(?:-(?:top|right|bottom|left|inline|block))?(?:-width)?|outline(?:-width|-offset)?)\s*:[^;{}]*?(?<![\w.-])(\d+(?:\.\d+)?)px/g;
const STROKE_WIDTH = /stroke-width\s*(?:=\s*["']|:\s*)(\d+(?:\.\d+)?)/g;
const DENSITY =
  /nc-density-(?:small|big)|--nc-density|--nc-control-(?:text|leading)|--nc-bar-h|--nc-control-h(?:-xs|-sm)?|--nc-tool-w|--nc-transport-h|(?<![\w-])control-type(?![\w-])/g;

const ICON_SIZE = /<nc-icon\b[^>]*\[size\]="(\d+)"/g;
const ICON_RESIZED = /<nc-icon\b[^>]*\[&>svg\]:(?:size|w|h)-/g;
const ICON_RESIZED_CSS = /nc-icon\s*>?\s*svg\s*\{[^}]*\b(?:width|height|scale|zoom)\s*:/g;

/** Class names only mean something inside a string, so prose that says "border" is not counted. */
function strings(line) {
  return [...line.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)].map(
    ([, single, double, template]) => single ?? double ?? template,
  );
}

function count(text, pattern, keep = () => true) {
  return [...text.matchAll(pattern)].filter(keep).length;
}

function violations(path, text) {
  const found = {
    rounded: 0,
    border: 0,
    'stroke-width': 0,
    density: 0,
    separator: 0,
    'icon-scale': 0,
  };
  found.separator = separators(path, text);
  found['icon-scale'] =
    count(text, ICON_SIZE, ([, size]) => size !== '24' && size !== '36') +
    count(text, ICON_RESIZED);
  found.density = count(text, DENSITY);
  found['stroke-width'] = count(text, STROKE_WIDTH, ([, width]) => offPixel(Number(width)));
  if (path.endsWith('.css')) {
    found.border = count(text, CSS_STROKE, ([, width]) => offPixel(Number(width)));
    found.rounded = count(text, /border-radius\s*:/g);
    found['icon-scale'] += count(text, ICON_RESIZED_CSS);
  }
  for (const line of text.split('\n')) {
    for (const literal of strings(line)) {
      found.rounded += count(literal, ROUNDED);
      found.border += count(literal, BARE_BORDER);
      found.border += count(literal, SIZED_BORDER, ([, step, px]) => offPixel(Number(step ?? px)));
    }
  }
  return Object.fromEntries(Object.entries(found).filter(([, total]) => total > 0));
}

const found = {};
for (const dir of SOURCES) {
  for (const file of walk(join(ROOT, dir))) {
    const owed = violations(file, readFileSync(file, 'utf8'));
    if (Object.keys(owed).length > 0) {
      found[relative(ROOT, file)] = owed;
    }
  }
}

// A catalogue is copy, so only the separator is looked for: a sentence that says "border" names
// no class.
for (const name of readdirSync(join(ROOT, CATALOGUES))) {
  const separator = separators(name, readFileSync(join(ROOT, CATALOGUES, name), 'utf8'));
  if (separator > 0) {
    found[`${CATALOGUES}/${name}`] = { separator };
  }
}

const allow = JSON.parse(readFileSync(ALLOW, 'utf8'));

if (process.argv.includes('--update')) {
  const owed = Object.fromEntries(Object.entries(found).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(ALLOW, `${JSON.stringify({ owed }, null, 2)}\n`);
  console.log(`pixel:check — ${Object.keys(owed).length} files recorded in tools/pixel-allow.json`);
  process.exit(0);
}

const over = [];
let slack = 0;
for (const [file, rules] of Object.entries(found)) {
  for (const [rule, total] of Object.entries(rules)) {
    const allowed = allow.owed[file]?.[rule] ?? 0;
    if (total > allowed) {
      over.push(`  ${file}: ${rule} ×${total} (allowed ${allowed})`);
    }
  }
}
for (const [file, rules] of Object.entries(allow.owed)) {
  for (const [rule, allowed] of Object.entries(rules)) {
    if ((found[file]?.[rule] ?? 0) < allowed) {
      slack += 1;
    }
  }
}

if (over.length > 0) {
  console.error('pixel:check — off the pixel grid:');
  console.error(over.join('\n'));
  console.error(
    '\nrounded: corners are stepped by the bevel utilities. border: a stroke is 3px or a multiple' +
      ' (border-3, or a bevel). density: use the --nc-h-* ladder. separator: no "·" between two' +
      ' things; a chip, a label and its value, or two elements a gap apart. icon-scale: an icon' +
      ' is 24 beside words or 36 standing alone; a smaller mark is an nc-mark, drawn for its size.',
  );
  process.exit(1);
}
const owing = Object.keys(allow.owed).length;
console.log(`pixel:check — clean (${owing} files still owe, see tools/pixel-allow.json)`);
if (slack > 0) {
  console.log(
    `  ${slack} entries are now higher than what is found: npm run pixel:check -- --update`,
  );
}
