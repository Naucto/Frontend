import { defineConfig } from 'vitest/config';

/**
 * Root-level specs: the ones under `tools/`, whose sources sit beside their esbuild runners.
 *
 * A tool's spec imports `./<tool>` and Vite's default extension order tries `.mjs` before `.ts`,
 * which hands the spec the runner instead of the module -- so `.ts` goes first here.
 */
export default defineConfig({
  resolve: { extensions: ['.ts', '.mts', '.mjs', '.js', '.json'] },
  test: {
    environment: 'node',
    include: ['tools/**/*.spec.ts'],
  },
});
