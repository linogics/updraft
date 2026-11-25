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
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true
  }
});
