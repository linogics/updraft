import { describe, expect, it, vi } from 'vitest';

import { addPlugin } from './actions';
import { pluginPrefs } from './pluginPrefs.svelte';

const backend = vi.hoisted(() => ({ id: 'acme/be', name: 'Be', kind: 'backend', apiVersion: 1, create: () => ({}) }));
const move = vi.hoisted(() => vi.fn());

vi.mock('./core', async (orig) => ({ ...(await orig<typeof import('./core')>()), loadPlugin: async () => backend }));
vi.mock('./cache', () => ({ cachePlugin: async () => {}, uncachePlugin: async () => {} }));
vi.mock('#lib/state/studioLayout.svelte', () => ({ studioLayout: { move, forget: () => {} } }));

describe('addPlugin', () => {
  it('stores a backend by URL without touching the layout', async () => {
    await addPlugin('https://a.test/be.js');
    expect(pluginPrefs.list).toEqual([{ url: 'https://a.test/be.js', id: 'acme/be', name: 'Be', kind: 'backend' }]);
    expect(move).not.toHaveBeenCalled();
  });
});
