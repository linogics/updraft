import js from '@eslint/js';
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
