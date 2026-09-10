#!/usr/bin/env node
/**
 * Checks that nothing served from a name that never changes is served as immutable.
 *
 * `immutable` promises the URL will never mean anything else, and only a name carrying a content
 * hash can promise that. Everything under `apps/web/public/` is copied out verbatim and keeps its
 * name across every deployment. Getting that wrong is invisible in dev, invisible to curl, and
 * permanent for the browser it happens to: it cost the translation catalogue a year, and the
 * runtime config before it. So the rule is checked against the files that actually ship.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'apps/web/public');
const CONF = join(ROOT, 'nginx/default.conf');

/** The `location` blocks, in the order nginx tries them, with the caching each one hands out. */
function locations(conf) {
  const out = [];
  const block = /location\s+(=|~\*|~)?\s*(\S+)\s*\{([^}]*)\}/g;
  for (const [, op, pattern, body] of conf.matchAll(block)) {
    const cache = /Cache-Control\s+"([^"]+)"/.exec(body)?.[1];
    out.push({ kind: op ?? 'prefix', pattern, cache });
  }
  return out;
}

function served(path, blocks) {
  const exact = blocks.find((b) => b.kind === '=' && b.pattern === path);
  if (exact) return exact;
  // nginx tries the regex blocks in the order they are written and takes the first that matches.
  return blocks.find(
    (b) => (b.kind === '~*' || b.kind === '~') && new RegExp(b.pattern, 'i').test(path),
  );
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

const blocks = locations(readFileSync(CONF, 'utf8'));
const offenders = [];
let checked = 0;
for (const file of walk(PUBLIC)) {
  const url = `/${relative(PUBLIC, file).split('\\').join('/')}`;
  checked += 1;
  const match = served(url, blocks);
  if (match?.cache?.includes('immutable')) offenders.push([url, match.pattern]);
}

console.log(`cache-check: ${checked} unhashed asset(s) under apps/web/public.`);
if (offenders.length) {
  console.error(`\n${offenders.length} of them would be served as immutable:`);
  for (const [url, pattern] of offenders) console.error(`  ${url}  →  location ~* ${pattern}`);
  console.error('\nA browser that fetches one of these keeps it until the cache is cleared.');
  process.exit(1);
}
console.log('None of them is served as immutable.');
