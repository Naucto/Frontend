import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import simpleImportSort from "eslint-plugin-simple-import-sort";

// Sources ending in a stylesheet/asset extension (incl. ?query suffix, e.g. .svg?react).
const ASSET = "\\.(css|scss|sass|less|svg|png|jpe?g|gif|webp|glsl|mp3|wav|ogg)(\\?\\w+)?$";
// Project path aliases (see tsconfig.paths.json), to tell them apart from npm @scope packages.
const PROJECT = "@(modules|shared|components|providers|hooks|utils|theme|api|errors|assets|lib|our-types)(/|$)";

export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: {
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.eslint.json"
      }
    },
    plugins: {
      js,
      react: pluginReact,
      "@typescript-eslint": tseslint.plugin,
      "simple-import-sort": simpleImportSort,
    },
    extends: ["js/recommended"],
    rules: {
      indent: ["error", 2, { "SwitchCase": 1 }],
      quotes: ["error", "double"],
      "@typescript-eslint/no-unused-vars": "warn",
      /* "no-console": "warn", */
      "react/react-in-jsx-scope": "off",
      "react/self-closing-comp": "error",
      "no-var": "error",
      "prefer-const": "error",
      "object-curly-spacing": ["error", "always"],
      "comma-spacing": ["error", { "before": false, "after": true }],
      "semi": ["error", "always"],
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      "eol-last": ["error", "always"],
      "no-multiple-empty-lines": ["error", { "max": 1 }],
      "no-trailing-spaces": ["error"],
      // Ordered import groups: project aliases, project relative, react,
      // other libraries, node builtins, then styles & assets last.
      "simple-import-sort/imports": ["error", {
        groups: [
          [`^(?!.*${ASSET})${PROJECT}`],
          [`^(?!.*${ASSET})\\.`],
          ["^react(-dom)?(/|$)"],
          [`^(?!node:)(?!.*${ASSET})@?\\w`],
          ["^node:"],
          [ASSET],
        ],
      }],
      // Enforce the alias policy: no raw src/ imports, no file extensions.
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["src/*", "src/**"], message: "Use a path alias (e.g. @shared, @modules) instead of a raw src/ import." },
          { group: ["**/*.ts", "**/*.tsx"], message: "Omit the .ts/.tsx file extension in import paths." },
        ],
      }],
    }
  },
  tseslint.configs.recommended,
  {
    ignores: ["src/api/*"]
  }
]);
