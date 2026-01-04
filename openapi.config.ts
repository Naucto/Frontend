import { generate } from 'openapi-typescript-codegen';

generate({
  input: process.env.BACKEND_URL || 'http://localhost:3000/swagger-json',
  output: './src/api',
  httpClient: 'axios',
  exportCore: false,         // don't regenerate src/api/core/*
  exportServices: true,
  exportModels: true,
  useUnionTypes: true,
});
