import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import noUnsanitized from 'eslint-plugin-no-unsanitized';
import playwright from 'eslint-plugin-playwright';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  {
    ignores: [
      'node_modules',
      '.svelte-kit',
      'build',
      'dist',
      'coverage',
      'static/cesium',
      'src/lib/paraglide',
      'test-results',
      'playwright-report',
      '.codegraph',
      'docs',
      'server/pb_migrations'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  // Flags innerHTML, outerHTML, insertAdjacentHTML and document.write with unsanitized input.
  noUnsanitized.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    rules: {
      // Dropping a key via `const { [id]: _, ...rest }` is intentional.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
      // App is served at the root without paths.base, and most links carry query strings resolve() cannot type.
      'svelte/no-navigation-without-resolve': 'off'
    }
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    // House style, see .claude/rules/web-style.md. Prettier keeps blank lines, so these do not fight it.
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'error',
        // A multi-line block starts a new step. One line that sets a value right above may stay attached.
        { blankLine: 'always', prev: '*', next: 'multiline-block-like' },
        {
          blankLine: 'any',
          prev: ['singleline-const', 'singleline-let', 'singleline-expression'],
          next: 'multiline-block-like'
        },
        // A closing brace ends a step.
        { blankLine: 'always', prev: 'block-like', next: '*' }
      ],
      // `x == null` stays allowed for the null-or-undefined idiom.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      // Single-line bodies may omit braces, multi-line bodies need them.
      curly: ['error', 'multi-line'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error'
    }
  },
  {
    // Sorted groups: side effects, node builtins, packages with SvelteKit modules, app aliases, relative.
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': [
        'error',
        { groups: [['^\\u0000'], ['^node:'], ['^@?\\w', '^\\$(app|env)(/|$)'], ['^#lib/', '^\\$lib(/|$)'], ['^\\.']] }
      ],
      'simple-import-sort/exports': 'error'
    }
  },
  {
    // CLI tooling, perf specs and benches print their results on purpose.
    files: ['scripts/**', 'e2e/perf.spec.ts', 'src/lib/bench/**'],
    rules: { 'no-console': 'off' }
  },
  {
    // Vitest recommended rules for unit tests and benches.
    files: ['src/**/*.test.ts', 'src/**/*.bench.ts'],
    ...vitest.configs.recommended,
    rules: {
      ...vitest.configs.recommended.rules,
      // expect(value, message) is a vitest feature and keeps failing pilots identifiable.
      'vitest/valid-expect': ['error', { maxArgs: 2 }],
      // expectSame in formats.test.ts wraps the assertions.
      'vitest/expect-expect': ['error', { assertFunctionNames: ['expect', 'expectSame'] }]
    }
  },
  {
    // Playwright recommended rules for e2e specs and fixtures.
    files: ['e2e/**/*.ts'],
    ...playwright.configs['flat/recommended']
  },
  {
    files: ['src/**/*.ts', 'src/**/*.svelte', 'e2e/**/*.ts'],
    ignores: ['src/service-worker.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte']
      }
    },
    rules: {
      // Every promise is awaited, returned, caught or marked with `void`, so no error is lost silently.
      '@typescript-eslint/no-floating-promises': 'error'
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    rules: {
      // Svelte writes `let` for $props and $derived. svelte/prefer-const skips those runes.
      'prefer-const': 'off',
      'svelte/prefer-const': 'error'
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser
      }
    }
  }
);
