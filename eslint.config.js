import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier';
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
      'docs'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
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
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error'
    }
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
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser
      }
    }
  }
);
