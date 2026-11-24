import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['localStorage', 'preferredLanguage', 'baseLocale']
    }),
    sveltekit({
      // SPA: Cesium is browser-only, every route renders client-side.
      // GitHub Pages serves 404.html for unknown paths, so deep links like /studio?... still boot the SPA.
      adapter: adapter({ fallback: '404.html' }),
      // Poll for a new deploy so the installed app can show the update banner.
      version: { pollInterval: 300000 }
    })
  ]
});
