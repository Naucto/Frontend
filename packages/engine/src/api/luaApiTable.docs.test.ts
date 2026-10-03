import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parse } from 'yaml';

import { LUA_API } from './luaApiTable';

interface ManifestEntry {
  name: string;
  signature?: string;
  summary?: string;
  aliases?: string[];
}

interface ManifestNs {
  namespace: string;
  functions: ManifestEntry[];
  values?: ManifestEntry[];
}

/** The one name the docs carry that is not a function in the table: `net.state` is a table. */
const DOCUMENTED_ELSEWHERE = new Set(['net.state']);

/** One sentence is one sentence whether or not it ends in a full stop. */
const sentence = (s: string): string => s.trim().replace(/\s+/g, ' ').replace(/\.$/, '');

const DOCS_API = resolve(import.meta.dirname, '../../../../docs/api');

describe('docs manifest parity', () => {
  const files = readdirSync(DOCS_API).filter((f) => f.endsWith('.yaml'));
  const documented = new Map<string, { signature: string; summary: string; aliases: string[] }>();
  for (const f of files) {
    const ns = parse(readFileSync(resolve(DOCS_API, f), 'utf8')) as ManifestNs;
    for (const fn of [...ns.functions, ...(ns.values ?? [])])
      documented.set(`${ns.namespace}.${fn.name}`, {
        signature: fn.signature ?? '',
        summary: fn.summary ?? '',
        aliases: fn.aliases ?? [],
      });
  }

  it('documents every engine function', () => {
    const missing = LUA_API.map((e) => `${e.ns}.${e.name}`).filter((n) => !documented.has(n));
    expect(missing).toEqual([]);
  });

  it('documents nothing the engine does not expose', () => {
    const known = new Set(LUA_API.map((e) => `${e.ns}.${e.name}`));
    const extra = [...documented.keys()].filter(
      (n) => !known.has(n) && !DOCUMENTED_ELSEWHERE.has(n),
    );
    expect(extra).toEqual([]);
  });

  it('agrees on signatures, summaries and legacy aliases', () => {
    for (const e of LUA_API) {
      const d = documented.get(`${e.ns}.${e.name}`);
      if (!d) continue;
      expect(d.signature, `${e.ns}.${e.name}`).toBe(e.signature);
      // The same sentence in both places, so the editor's completion and the reference never
      // describe one function two ways.
      expect(sentence(d.summary), `${e.ns}.${e.name} summary`).toBe(sentence(e.summary));
      if (e.legacy) expect(d.aliases, `${e.ns}.${e.name} alias`).toContain(e.legacy);
    }
  });
});
