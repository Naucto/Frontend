import { createRequire } from "node:module";
import { createDefaultPreset, pathsToModuleNameMapper } from "ts-jest";

const localRequire = createRequire(import.meta.url);
const baseTsConfig = localRequire("./tsconfig.base.json");

const tsJest = createDefaultPreset();

const moduleNameMapper = {
  "^.+\\.(css|less|gif|jpg|jpeg|svg|png)$": "<rootDir>/__mocks__/styleMock.ts",
  ...pathsToModuleNameMapper(baseTsConfig.compilerOptions?.paths ?? {}, {
    prefix: "<rootDir>/"
  })
};

export default {
  ...tsJest,
  displayName: "app",
  testEnvironment: "jsdom",
  moduleNameMapper,
  transform: {
    "^.+\\.(t|j)sx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }]
  }
};
