import { createRequire } from "node:module";
import { pathsToModuleNameMapper } from "ts-jest";

const localRequire = createRequire(import.meta.url);
const pathsConfig = localRequire("./tsconfig.paths.json");

const moduleNameMapper = {
  "^.+\\.(css|less|gif|jpg|jpeg|svg|png)$": "<rootDir>/__mocks__/styleMock.ts",
  ...pathsToModuleNameMapper(pathsConfig.compilerOptions?.paths ?? {}, {
    prefix: "<rootDir>/"
  })
};

export default {
  displayName: "app",
  testEnvironment: "jsdom",
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper,
  transform: {
    "^.+\\.(t|j)sx?$": [
      "@swc/jest",
      {
        jsc: {
          parser: {
            syntax: "typescript",
            tsx: true
          },
          transform: {
            react: {
              runtime: "automatic"
            }
          },
          target: "es2022"
        },
        module: {
          type: "es6"
        }
      }
    ]
  }
};
