import js from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import templateChildPerLine from './tools/eslint/template-child-per-line.mjs';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'dist-tools/**',
      '**/.angular/**',
      'docs/**',
      'patches/**',
      'apps/web/src/assets/docs/**',
      'packages/api-client/src/**',
    ],
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/no-empty-function': ['error', { allow: ['methods', 'overrideMethods'] }],
      '@typescript-eslint/no-base-to-string': [
        'error',
        {
          ignoredTypeNames: [
            'Error',
            'RegExp',
            'URL',
            'URLSearchParams',
            'YText',
            'Text',
            'AbstractType',
          ],
        },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'id-length': [
        'error',
        { min: 2, properties: 'never', exceptions: ['i', 'j', 'k', 'x', 'y', 'a', 'b', '_', 'Y'] },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'PrivateIdentifier',
          message: 'Use the private keyword rather than a #private field.',
        },
      ],
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: { direct: true, named: true, defaultFrom: true, namedFrom: true },
        },
      ],
    },
  },
  {
    // A lazy route and a tool's config file are both read through the module's default export.
    files: [
      '**/*.page.ts',
      '**/*.routes.ts',
      '**/*-shell.component.ts',
      '**/*.config.ts',
      '**/*.d.ts',
    ],
    rules: { 'no-restricted-exports': 'off' },
  },
  {
    files: ['apps/web/**/*.ts', 'packages/ui/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'nc', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'nc', style: 'kebab-case' },
      ],
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-standalone': 'error',
      // The rule takes no option to leave its styles count out, so that one is set out of reach.
      '@angular-eslint/component-max-inline-declarations': ['error', { template: 5, styles: 40 }],
      // Tailwind generates no eighth-step spacing, so such a class silently applies nothing; use an
      // arbitrary value.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'PrivateIdentifier',
          message: 'Use the private keyword rather than a #private field.',
        },
        {
          selector: "Property[key.name='queryKey'][value.type='ArrayExpression']",
          message:
            'Build query keys with qk (shared/queries/query-keys.ts), so an invalidation names the same key the query does.',
        },
        {
          selector:
            'TemplateElement[value.raw=/(^|[\\s"\\x27])[a-z:-]*(gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|top|bottom|left|right|inset|space-x|space-y)-[0-9]+[.](125|375|625|875)([\\s"\\x27]|$)/]',
          message:
            'Tailwind does not generate eighth-step spacing (…-1.375, …-0.625). It fails silently — use an arbitrary value like gap-[11px].',
        },
      ],
    },
  },
  {
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@angular/*', '@naucto/ui', '@naucto/api-client', 'rxjs'],
              message: 'packages/engine must stay framework-free.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/src/app/core/**/*.ts', 'apps/web/src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/features/**'], message: 'core/shared must not import features.' },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    plugins: { naucto: { rules: { 'template-child-per-line': templateChildPerLine } } },
    rules: {
      'naucto/template-child-per-line': 'error',
      // The same refusal as for inline templates, whose selector never visits an .html file: it is
      // parsed into a different tree.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ':matches(TextAttribute, LiteralPrimitive)[value=/(^|\\s)[a-z:-]*(gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|top|bottom|left|right|inset|space-x|space-y)-[0-9]+[.](125|375|625|875)(\\s|$)/]',
          message:
            'Tailwind does not generate eighth-step spacing (…-1.375, …-0.625). It fails silently — use an arbitrary value like gap-[11px].',
        },
      ],
    },
  },
  {
    files: ['playwright.config.ts', 'e2e/**/*.ts', 'tools/**/*.{ts,mjs}'],
    ignores: ['tools/env.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read it with getEnv / getOptionalEnv from tools/env.ts, where it is declared.',
        },
      ],
    },
  },
  {
    // A test host's template is a fixture, read next to the assertions that drive it.
    files: ['apps/web/**/*.spec.ts', 'packages/ui/**/*.spec.ts'],
    rules: { '@angular-eslint/component-max-inline-declarations': 'off' },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },
  {
    // Lifted verbatim from the previous engine; fengari is untyped and these files predate the strict rules.
    files: [
      'packages/engine/src/vm/LuaEnvironment.ts',
      'packages/engine/src/net/*.ts',
      'packages/engine/src/api/NetAPI.ts',
    ],
    rules: {
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // Command-line tooling: printing what it did is the whole interface, and it reads its
    // configuration from the environment rather than from the app's config service.
    files: ['tools/**/*.{ts,mjs}'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/dot-notation': 'off',
    },
  },
  prettier,
  {
    // After the Prettier preset, which turns curly off: its 'all' form never fights the formatter.
    files: ['**/*.{ts,js,mjs}'],
    rules: { curly: ['error', 'all'] },
  },
);
