// Pure client-side app: Cesium and IndexedDB need the browser.
export const ssr = false;
// Emit an HTML shell per route (index.html, studio.html) so static hosts answer 200, not the 404 fallback.
export const prerender = true;
