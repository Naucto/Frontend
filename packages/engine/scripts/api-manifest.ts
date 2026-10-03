/**
 * Writes the Lua API as the engine registers it -- each member's signature, summary, parameters and
 * return type -- to the JSON file named by the one argument, for the docs build to merge with the
 * prose it keeps. Run from the repo root:
 * `node tools/run-ts.mjs packages/engine/scripts/api-manifest.ts <out.json>`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { LUA_API } from '../src/api/luaApiTable';

const [out] = process.argv.slice(2);
if (!out) {
  console.error('usage: node tools/run-ts.mjs packages/engine/scripts/api-manifest.ts <out.json>');
  process.exit(2);
}
const path = resolve(out);
await mkdir(dirname(path), { recursive: true });
await writeFile(path, `${JSON.stringify(LUA_API, null, 2)}\n`);
