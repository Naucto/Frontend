/**
 * The Backend's contract, and the copy the app is built from, must be the same document.
 *
 * `Backend/swagger.json` is generated from the controllers and is checked against itself in the
 * Backend's own CI. Nothing there knows that a second, hand-copied copy lives in this repo, which is
 * the one `@naucto/api-client` is generated from and the one the app compiles against — so a DTO or
 * a status code can change in the Backend, pass its own drift check, and leave the app quietly
 * building against a stale contract. That happened three times over, in three changes.
 *
 * Compared as parsed JSON rather than as bytes: the two files are formatted differently, and only
 * the structure is the contract.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = join(here, '..');
const backend =
  process.env.NAUCTO_BACKEND_CONTRACT ?? join(frontend, '..', 'Backend', 'swagger.json');
const mine = join(frontend, 'packages', 'api-client', 'openapi.json');

/** Where two documents differ, as the paths a person would change, rather than a diff of bytes. */
const differences = (a, b, at = '$') => {
  if (a === b) return [];
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return [at];
  if (Array.isArray(a) !== Array.isArray(b)) return [at];
  if (Array.isArray(a)) {
    if (a.length !== b.length) return [`${at} (${a.length} vs ${b.length})`];
    return a.flatMap((entry, i) => differences(entry, b[i], `${at}[${i}]`));
  }
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((key) =>
    key in a && key in b ? differences(a[key], b[key], `${at}.${key}`) : [`${at}.${key}`],
  );
};

let theirs;
try {
  theirs = JSON.parse(await readFile(backend, 'utf8'));
} catch (error) {
  console.error(
    `Cannot read the Backend contract at ${backend}: ${error instanceof Error ? error.message : error}`,
  );
  console.error(
    'Set NAUCTO_BACKEND_CONTRACT to its swagger.json, or run this from a checkout beside it.',
  );
  // Distinct from 1: nothing was compared, which is a different thing from having compared and found
  // a difference. CI warns about this rather than blocking on a contract it could not fetch.
  process.exit(2);
}
const ours = JSON.parse(await readFile(mine, 'utf8'));

const drifted = differences(theirs, ours);
if (drifted.length) {
  console.error(
    `The Backend contract and packages/api-client/openapi.json disagree in ${drifted.length} place(s):`,
  );
  for (const path of drifted.slice(0, 40)) console.error(`  ${path}`);
  if (drifted.length > 40) console.error(`  … and ${drifted.length - 40} more`);
  console.error(
    '\nCopy Backend/swagger.json over it and run `npm run generate -w packages/api-client`.',
  );
  process.exit(1);
}
console.log('The Backend contract and the app client agree.');
