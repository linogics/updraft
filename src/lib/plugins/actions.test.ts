import { describe, expect, it, vi } from 'vitest';

import { addPlugin } from './actions';
import { pluginPrefs } from './pluginPrefs.svelte';

const loaded = vi.hoisted((): { current: object } => ({
  current: { id: 'acme/be', name: 'Be', kind: 'backend', apiVersion: 1, create: () => ({}) }
}));
const move = vi.hoisted(() => vi.fn());

vi.mock('./core', async (orig) => ({
  ...(await orig<typeof import('./core')>()),
  loadPlugin: () => Promise.resolve(loaded.current)
}));
vi.mock('./cache', () => ({ cachePlugin: async () => {}, uncachePlugin: async () => {} }));
vi.mock('#lib/state/studioLayout.svelte', () => ({ studioLayout: { move, forget: () => {} } }));

describe('addPlugin', () => {
  it('stores a backend by URL without touching the layout', async () => {
    await addPlugin('https://a.test/be.js');
    expect(pluginPrefs.list).toEqual([{ url: 'https://a.test/be.js', id: 'acme/be', name: 'Be', kind: 'backend' }]);
    expect(move).not.toHaveBeenCalled();
  });

  const conv = (extensions: string[]) => ({
    id: 'acme/csv',
    name: 'CSV',
    kind: 'converter',
    apiVersion: 1,
    label: 'CSV',
    extensions,
    read: () => ({})
  });

  it('refuses a converter whose extension is already handled', async () => {
    loaded.current = conv(['csv', 'igc']);
    await expect(addPlugin('https://a.test/csv.js')).rejects.toThrow('The extension ".igc" is already handled by IGC.');
    expect(pluginPrefs.list.some((e) => e.kind === 'converter')).toBe(false);
  });

  it('stores a converter with what the app needs without importing it', async () => {
    loaded.current = conv(['csv']);
    await addPlugin('https://a.test/csv.js');
    expect(pluginPrefs.list.at(-1)).toEqual({
      url: 'https://a.test/csv.js',
      id: 'acme/csv',
      name: 'CSV',
      kind: 'converter',
      label: 'CSV',
      extensions: ['csv'],
      canRead: true,
      canWrite: false
    });
    loaded.current = { ...conv(['csv']), id: 'acme/csv2' };
    await expect(addPlugin('https://a.test/csv2.js')).rejects.toThrow('already handled by CSV');
  });

  it('stores an xc-planner plugin with its export metadata', async () => {
    loaded.current = {
      id: 'acme/tasks',
      name: 'Tasks',
      kind: 'xc-planner',
      apiVersion: 1,
      exports: [
        { label: ' CSV ', extension: 'csv', mime: 'text/csv', write: () => '' },
        { label: 'TXT', extension: 'txt', write: () => '' }
      ]
    };
    await addPlugin('https://a.test/tasks.js');
    expect(pluginPrefs.list.at(-1)).toEqual({
      url: 'https://a.test/tasks.js',
      id: 'acme/tasks',
      name: 'Tasks',
      kind: 'xc-planner',
      exports: [
        { label: 'CSV', extension: 'csv', mime: 'text/csv' },
        { label: 'TXT', extension: 'txt' }
      ]
    });
  });

  it('refuses a kind the page does not accept and stores nothing', async () => {
    const before = pluginPrefs.list.length;
    loaded.current = { ...conv(['zzz']), id: 'acme/zzz' };
    await expect(addPlugin('https://a.test/zzz.js', { kinds: ['studio'] })).rejects.toThrow(
      'This page only accepts studio plugins.'
    );
    expect(pluginPrefs.list).toHaveLength(before);
    await addPlugin('https://a.test/zzz.js', { kinds: ['converter'] });
    expect(pluginPrefs.list).toHaveLength(before + 1);
  });
});
