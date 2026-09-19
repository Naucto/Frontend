import js from '@eslint/js';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.angular/**',
      'docs/**',
      'patches/**',
      'apps/web/src/assets/docs/**',
      'packages/api-client/src/**',
    ],
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
    },
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
      // Tailwind's spacing scale stops at quarter steps. An eighth — gap-1.375, py-1.375,
      // mb-1.625, px-0.375 — generates no rule at all and the property simply never applies, so a
      // name ends up flush against its avatar and nothing anywhere says why. Use an arbitrary
      // value (gap-[11px]) when the design asks for something off the scale.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TemplateElement[value.raw=/(^|[\\s\"\\x27])[a-z:-]*(gap|gap-x|gap-y|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|top|bottom|left|right|inset|space-x|space-y)-[0-9]+[.](125|375|625|875)([\\s\"\\x27]|$)/]',
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
);
