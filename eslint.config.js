import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";


export default defineConfig([
  {
    files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { js },
    extends: ["js/recommended"],
    rules: {
      indent: ["error", 2],
      "react/react-in-jsx-scope": "off",
      ...pluginReact.configs.flat.recommended.rules
    },
  },
  tseslint.configs.recommended,
]);
