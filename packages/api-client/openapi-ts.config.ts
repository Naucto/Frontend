import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: 'openapi.json',
  output: { path: 'src', format: 'prettier', lint: false },
  plugins: [
    { name: '@hey-api/client-fetch', bundle: true },
    { name: '@hey-api/typescript', enums: 'javascript' },
    { name: '@hey-api/sdk', operations: { nesting: 'operationId' } },
  ],
});
