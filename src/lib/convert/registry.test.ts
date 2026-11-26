import { describe, expect, it, vi } from 'vitest';

import { writeGpx } from '#lib/domain/formats/gpx';
import { readIgc } from '#lib/domain/formats/igc';
import { buildIgc } from '#lib/domain/testing/igc-builder';
import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';

import { clashOf, converters, formatOf, readers, readTrack, writers, writeTrack } from './registry';

vi.mock('#lib/plugins/core', async (orig) => ({
  ...(await orig<typeof import('#lib/plugins/core')>()),
  loadPlugin: () =>
    Promise.resolve({
      id: 'acme/x',
      name: 'X',
      kind: 'converter',
      apiVersion: 1,
      label: 'X',
      extensions: ['xyz'],
      write: () => ''
    })
}));

const flight = readIgc(
  buildIgc([
    { sec: 36000, lat: 47.1, lon: 11.6, gpsAlt: 1500 },
    { sec: 36001, lat: 47.2, lon: 11.7, gpsAlt: 1502 }
  ]),
  'a.igc'
);

describe('converter registry', () => {
  it('bundles the six formats', () => {
    expect(converters().map((c) => [c.label, ...c.extensions])).toEqual([
      ['IGC', 'igc'],
      ['GPX', 'gpx'],
      ['KML', 'kml'],
      ['GeoJSON', 'geojson', 'json'],
      ['TRK', 'trk'],
      ['FIT', 'fit']
    ]);
    expect(readers()).toHaveLength(6);
    expect(writers().map((c) => c.label)).toEqual(['IGC', 'GPX', 'KML', 'GeoJSON']);
  });

  it('finds the format by extension, case-insensitive', () => {
    expect(formatOf('x.JSON')).toBe('GeoJSON');
    expect(formatOf('x.txt')).toBeUndefined();
  });

  it('reads through the bundled plugin and assigns id and sourceName', async () => {
    const f = await readTrack(new File([writeGpx(flight)], 'Flight.GPX'));
    expect(f.pilot).toBe('Flight');
    expect(f.sourceName).toBe('Flight.GPX');
    expect(f.id).toMatch(/-/);
  });

  it('rejects unsupported extensions', async () => {
    await expect(readTrack(new File(['x'], 'a.txt'))).rejects.toThrow('Unsupported file type');
  });

  it('writes bytes', async () => {
    const gpx = writers().find((c) => c.label === 'GPX')!;
    expect(new TextDecoder().decode(await writeTrack(gpx, flight))).toContain('<gpx');
  });

  it('reports a clash with the first matching converter', () => {
    expect(clashOf(['abc', 'igc'])).toMatchObject({ ext: 'igc', c: { label: 'IGC' } });
    expect(clashOf(['abc'])).toBeUndefined();
  });

  it('loads every bundled converter, so drift from the metadata fails here', async () => {
    for (const c of converters()) await expect(c.load()).resolves.toMatchObject({ id: c.id });
  });

  it('refuses an installed converter that changed since it was added', async () => {
    pluginPrefs.add({
      url: 'https://a.test/x.js',
      id: 'acme/x',
      name: 'X',
      kind: 'converter',
      label: 'X',
      extensions: ['xyz'],
      canRead: true,
      canWrite: true
    });
    const c = converters().find((x) => x.id === 'acme/x')!;
    await expect(c.load()).rejects.toThrow(/changed since it was added/);
  });
});
