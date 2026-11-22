/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';

const sw = globalThis as unknown as ServiceWorkerGlobalScope;
const CACHE = `updraft-${version}`;
const absolute = (path: string) => (path.startsWith('/') ? path : `/${path}`);
// Cesium runtime is large and only needed online, so it stays out of the precache.
const PRECACHE = [...immutable, ...assets, ...prerendered]
  .map((file) => absolute(file.path))
  .filter((path) => !path.startsWith('/cesium/') && path !== '/CNAME');
const PRECACHED = new Set(PRECACHE);
const PAGES = new Set(prerendered.map((page) => absolute(page.path)));

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('updraft-') && key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Other origins (map tiles, terrain, fonts) and non-GET requests are not touched.
  if (request.method !== 'GET' || url.origin !== sw.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(request, url.pathname));
  } else if (PRECACHED.has(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE)
        .then((cache) => cache.match(url.pathname))
        .then((hit) => hit ?? fetch(request))
    );
  }
});

async function navigate(request: Request, path: string): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    const page = (PAGES.has(path) && (await cache.match(path))) || (await cache.match('/'));
    return page ?? Response.error();
  }
}
