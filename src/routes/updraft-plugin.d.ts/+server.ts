import src from '#lib/plugins/api.d.ts?raw';

export const prerender = true;

/** The typed contract for plugin authors, see docs/plugins.md. */
export const GET = () => new Response(src, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
