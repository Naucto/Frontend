import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import { LUA_API } from './luaApiTable';

interface ManifestNs {
  namespace: string;
  functions: { name: string; signature: string; aliases?: string[] }[];
  values?: { name: string }[];
}

const DOCS_API = resolve(import.meta.dirname, '../../../../docs/api');

/** The docs submodule must document every engine function, and document nothing the engine lacks. */
describe('docs manifest parity', () => {
  const files = readdirSync(DOCS_API).filter((f) => f.endsWith('.yaml'));
  const documented = new Map<string, { signature: string; aliases: string[] }>();
  for (const f of files) {
    const ns = parse(readFileSync(resolve(DOCS_API, f), 'utf8')) as ManifestNs;
    for (const fn of ns.functions)
      documented.set(`${ns.namespace}.${fn.name}`, {
        signature: fn.signature,
        aliases: fn.aliases ?? [],
      });
  }

  it('documents every engine function', () => {
    const missing = LUA_API.map((e) => `${e.ns}.${e.name}`).filter((n) => !documented.has(n));
    expect(missing).toEqual([]);
  });

  it('documents nothing the engine does not expose', () => {
    const known = new Set(LUA_API.map((e) => `${e.ns}.${e.name}`));
    // net.join/leave/id/emit/lock… are exposed by NetAPI directly; anything else must be in the table.
    const extra = [...documented.keys()].filter((n) => !known.has(n) && !n.startsWith('net.'));
    expect(extra).toEqual([]);
  });

  it('agrees on signatures and legacy aliases', () => {
    for (const e of LUA_API) {
      const d = documented.get(`${e.ns}.${e.name}`);
      if (!d) continue;
      expect(d.signature, `${e.ns}.${e.name}`).toBe(e.signature);
      if (e.legacy) expect(d.aliases, `${e.ns}.${e.name} alias`).toContain(e.legacy);
    }
  });
});
