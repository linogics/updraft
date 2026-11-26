import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Unit tests cover the domain layer and rune state. The Svelte plugin only compiles .svelte.ts runes, no SvelteKit.
// Paraglide compiles the messages so modules that import them resolve under test.
// Outside a browser Paraglide always resolves the base locale, so tests see English.
export default defineConfig({
  plugins: [
    svelte(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
    })
  ],
  test: {
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
          exclude: ['src/**/*.client.*test.ts', 'node_modules/**'],
          environment: 'node'
        }
      },
      {
        extends: true,
        // The browser condition picks the client build of Svelte, so effects run.
        resolve: { conditions: ['browser'] },
        test: {
          name: 'client',
          include: ['src/**/*.client.*test.ts'],
          environment: './vitest.client-env.ts',
          // Node would load the server build of an external svelte, inlining lets the condition apply.
          server: { deps: { inline: [/svelte/] } }
        }
      }
    ]
  }
});
