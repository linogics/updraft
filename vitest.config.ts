import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vitest/config';

// Unit tests cover the framework-free domain layer only, so no SvelteKit plugin here.
// Paraglide compiles the messages so modules that import them resolve under test.
// Outside a browser Paraglide always resolves the base locale, so tests see English.
export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
    })
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true
  }
});
