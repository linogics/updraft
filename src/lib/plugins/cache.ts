/** Cache name the service worker looks in. It must not start with "updraft-", the activate step deletes those. */
export const PLUGIN_CACHE = 'plugins';

/** Stores the plugin module once, so the service worker can serve it offline. Best effort. */
export async function cachePlugin(url: string) {
  try {
    const res = await fetch(url);
    if (res.ok) await (await caches.open(PLUGIN_CACHE)).put(url, res);
  } catch (err) {
    console.warn('Plugin not cached for offline use', err);
  }
}

export async function uncachePlugin(url: string) {
  try {
    await (await caches.open(PLUGIN_CACHE)).delete(url);
  } catch (err) {
    console.warn('Plugin cache entry not removed', err);
  }
}
