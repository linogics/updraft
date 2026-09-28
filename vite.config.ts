import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

/**
 * Serves /config.json in dev so the app reads runtime config the same way
 * it does behind Caddy in production (see deploy/caddy/Caddyfile).
 */
function devRuntimeConfig(): Plugin {
  return {
    name: 'dev-runtime-config',
    configureServer(server) {
      server.middlewares.use('/config.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ cesiumIonToken: process.env.CESIUM_ION_TOKEN ?? '' }));
      });
    }
  };
}

export default defineConfig({
  plugins: [
    sveltekit({
      // SPA: Cesium is browser-only, every route renders client-side.
      adapter: adapter({ fallback: 'index.html' }),
      // SvelteKit 3 dropped the implicit $lib alias.
      alias: { '#lib': 'src/lib' }
    }),
    devRuntimeConfig()
  ]
});
