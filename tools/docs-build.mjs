// Builds the Engine-Documentation submodule (docs/) into apps/web/src/assets/docs.
// Until the submodule is converted to Markdown + API manifest (docs PR D1), this is a no-op
// that only writes an empty index so the app can boot without docs.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const out = resolve(import.meta.dirname, '../apps/web/src/assets/docs');
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'index.json'), JSON.stringify({ pages: [], manifest: null }) + '\n');
console.warn(`docs-build: wrote empty index to ${out} (docs submodule not converted yet)`);
