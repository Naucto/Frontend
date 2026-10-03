#!/usr/bin/env node
/**
 * Checks that no unhashed file under apps/web/public is served as immutable by nginx/default.conf.
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
    out.push({ kind: op ?? 'prefix', pattern: pattern.replace(/^"(.*)"$/, '$1'), cache });
  }
  return out;
}

function served(path, blocks) {
  const exact = blocks.find((b) => b.kind === '=' && b.pattern === path);
  if (exact) {
    return exact;
  }
  // nginx tries the regex blocks in the order they are written and takes the first that matches.
  return blocks.find(
    (b) => (b.kind === '~*' || b.kind === '~') && new RegExp(b.pattern, 'i').test(path),
  );
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      yield* walk(path);
    } else {
      yield path;
    }
  }
}

const blocks = locations(readFileSync(CONF, 'utf8'));
const offenders = [];
let checked = 0;
for (const file of walk(PUBLIC)) {
  const url = `/${relative(PUBLIC, file).split('\\').join('/')}`;
  checked += 1;
  const match = served(url, blocks);
  if (match?.cache?.includes('immutable')) {
    offenders.push([url, match.pattern]);
  }
}

console.log(`cache-check: ${checked} unhashed asset(s) under apps/web/public.`);
if (offenders.length) {
  console.error(`\n${offenders.length} of them would be served as immutable:`);
  for (const [url, pattern] of offenders) {
    console.error(`  ${url}  →  location ~* ${pattern}`);
  }
  console.error('\nA browser that fetches one of these keeps it until the cache is cleared.');
  process.exit(1);
}
console.log('None of them is served as immutable.');
