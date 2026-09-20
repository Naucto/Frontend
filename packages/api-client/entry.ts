/**
 * The package's public surface.
 *
 * `src/index.ts` is rewritten wholesale every time the client is regenerated from `openapi.json`,
 * so anything the application needs beyond the generated operations has to live outside it — the
 * configured `client` itself above all, which is where the base URL and the bearer header are set.
 * Re-exporting from here is what keeps a regeneration from quietly removing it.
 */
export type { Client } from './src/client';
export { client } from './src/client.gen';
export * from './src/index';
