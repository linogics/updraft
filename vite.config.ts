import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      // SPA: Cesium is browser-only, every route renders client-side.
      // GitHub Pages serves 404.html for unknown paths, so deep links like /replay?... still boot the SPA.
      adapter: adapter({ fallback: '404.html' }),
      // SvelteKit 3 dropped the implicit $lib alias.
      alias: { '#lib': 'src/lib' }
    })
  ]
});
