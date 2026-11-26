import { describe, expect, it, vi } from 'vitest';

import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';

import { planExports } from './exports';

const loaded = vi.hoisted((): { current: unknown } => ({ current: null }));

vi.mock('#lib/plugins/core', async (orig) => ({
  ...(await orig<typeof import('#lib/plugins/core')>()),
  loadPlugin: () => Promise.resolve(loaded.current)
}));

const route = {
  points: [
    { lat: 47, lon: 8 },
    { lat: 47.1, lon: 8.2 }
  ],
  speed: 30
};

const plugin = (write: (r: unknown) => unknown, extension = 'csv') => ({
  id: 'acme/csv',
  name: 'CSV',
  kind: 'xc-planner',
  apiVersion: 1,
  exports: [{ label: 'CSV', extension, write }]
});

const install = () =>
  pluginPrefs.add({
    url: 'https://a.test/csv.js',
    id: 'acme/csv',
    name: 'CSV',
    kind: 'xc-planner',
    exports: [{ label: 'CSV', extension: 'csv', mime: 'text/csv' }]
  });

const csv = () => planExports().find((e) => e.id === 'acme/csv#0')!;

describe('planner exports', () => {
  it('lists the bundled task formats in order', () => {
    expect(planExports().map((e) => [e.id, e.title(), e.extension])).toEqual([
      ['updraft/tasks#0', 'XCTrack task', 'xctsk'],
      ['updraft/tasks#1', 'GPX route', 'gpx']
    ]);
  });

  it('writes the bundled formats as bytes', async () => {
    const [task, gpx] = planExports();
    const t = JSON.parse(new TextDecoder().decode(await task.write(route))) as { turnpoints: unknown[] };
    expect(t.turnpoints).toHaveLength(2);
    expect(new TextDecoder().decode(await gpx.write(route))).toContain('<rte>');
  });

  it('loads every bundled plugin, so drift from the metadata fails here', async () => {
    for (const e of planExports()) await expect(e.write(route)).resolves.toBeInstanceOf(Uint8Array);
  });

  it('lists installed exports after the bundled ones and encodes text', async () => {
    install();
    loaded.current = plugin(() => 'a,b');
    expect(
      planExports()
        .map((e) => e.id)
        .slice(-1)
    ).toEqual(['acme/csv#0']);
    expect(csv().mime).toBe('text/csv');
    expect(new TextDecoder().decode(await csv().write(route))).toBe('a,b');
  });

  it('passes bytes through and rejects other output', async () => {
    loaded.current = plugin(() => new Uint8Array([1, 2]));
    expect([...(await csv().write(route))]).toEqual([1, 2]);
    loaded.current = plugin(() => 5);
    await expect(csv().write(route)).rejects.toThrow('must return a string or a Uint8Array');
  });

  it('refuses a plugin that changed since it was added', async () => {
    loaded.current = plugin(() => '', 'txt');
    await expect(csv().write(route)).rejects.toThrow(/changed since it was added/);
  });

  it('hands the plugin a copy of the route', async () => {
    loaded.current = plugin((r) => {
      const x = r as { points: { lat: number }[]; speed: number };
      try {
        x.points[0].lat = 0;
      } catch {
        // frozen points throw in strict mode
      }

      (x as { points: unknown }).points = [];
      x.speed = 0;
      return '';
    });
    await csv().write(route);
    expect(route.points[0].lat).toBe(47);
    expect(route.points).toHaveLength(2);
    expect(route.speed).toBe(30);
  });
});
