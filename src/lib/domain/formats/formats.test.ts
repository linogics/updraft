import { describe, expect, it } from 'vitest';
import { FitBaseType, FitEncoder } from 'fit-file-parser';
import { buildIgc } from '../testing/igc-builder';
import type { Flight } from '../model';
import { readFit } from './fit';
import { readGeoJson } from './geojson';
import { readGpx } from './gpx';
import { readIgc } from './igc';
import { readKml } from './kml';
import { readTrk } from './trk';
import { WRITERS, readTrack } from './index';

const flight: Flight = readIgc(
  buildIgc([
    { sec: 36000, lat: 47.123456, lon: 11.654321, gpsAlt: 1500 },
    { sec: 36001, lat: 47.123556, lon: 11.654421, gpsAlt: 1502 },
    { sec: 36002, lat: -33.5, lon: -70.25, gpsAlt: 1504 }
  ]),
  'a.igc'
);

function expectSame(a: Flight, b: Flight) {
  expect(b.fixes).toHaveLength(a.fixes.length);
  a.fixes.forEach((f, i) => {
    expect(Math.abs(b.fixes[i].lat - f.lat)).toBeLessThan(1e-5);
    expect(Math.abs(b.fixes[i].lon - f.lon)).toBeLessThan(1e-5);
    expect(Math.abs(b.fixes[i].alt - f.alt)).toBeLessThan(1);
    expect(Math.abs(b.fixes[i].t - f.t)).toBeLessThan(1000);
  });
  expect(b.date).toBe(a.date);
}

describe('round trips', () => {
  it('igc', () => {
    const out = WRITERS.igc.write(flight);
    expect(out).toContain('\r\n');
    expect(out.startsWith('AXXXupdraft')).toBe(true);
    expectSame(flight, readIgc(out, 'b.igc'));
  });
  it('gpx', () => expectSame(flight, readGpx(WRITERS.gpx.write(flight), 'b.gpx')));
  it('kml', () => expectSame(flight, readKml(WRITERS.kml.write(flight), 'b.kml')));
  it('geojson', () => expectSame(flight, readGeoJson(WRITERS.geojson.write(flight), 'b.geojson')));
});

describe('readers', () => {
  it('reads a TRK sample', () => {
    const trk = [
      'H  SOFTWARE NAME & VERSION',
      'G  WGS 84',
      'T  A 47.123456ºN 11.123456ºE 27-MAR-08 10:26:00 s 1456.0 0.0',
      'T  A 47.123556ºN 11.123556ºW 27-MAR-08 10:26:01 s 1458.0 0.0'
    ].join('\n');
    const f = readTrk(trk, 'sample.trk');
    expect(f.fixes).toHaveLength(2);
    expect(f.fixes[0]).toEqual({ t: Date.UTC(2008, 2, 27, 10, 26, 0), lat: 47.123456, lon: 11.123456, alt: 1456 });
    expect(f.fixes[1].lon).toBeCloseTo(-11.123556);
    expect(f.pilot).toBe('sample');
    expect(f.date).toBe('2008-03-27');
  });

  it('reads geojson with unix seconds as 4th coordinate', () => {
    const json = JSON.stringify({ type: 'LineString', coordinates: [[11, 47, 1000, 1700000000], [11.1, 47.1, 1010, 1700000001]] });
    expect(readGeoJson(json, 'x.json').fixes[1].t).toBe(1700000001000);
  });

  it('rejects tracks without time', () => {
    const noTime = JSON.stringify({ type: 'LineString', coordinates: [[11, 47, 1000]] });
    expect(() => readGeoJson(noTime, 'x.geojson')).toThrow(/without time/);
    const kml = '<kml><Placemark><LineString><coordinates>11,47,1000</coordinates></LineString></Placemark></kml>';
    expect(() => readKml(kml, 'x.kml')).toThrow(/no time/);
  });

  it('rejects unsupported extensions', async () => {
    await expect(readTrack(new File(['x'], 'a.txt'))).rejects.toThrow('Unsupported file type');
  });

  it('dispatches on extension, case-insensitive', async () => {
    const f = await readTrack(new File([WRITERS.gpx.write(flight)], 'Flight.GPX'));
    expect(f.pilot).toBe('Flight');
  });

  it('reads a FIT file built with the encoder', async () => {
    const semi = (deg: number) => Math.round((deg * 2 ** 31) / 180);
    const enc = new FitEncoder();
    const t0 = FitEncoder.toFitTimestamp(new Date('2026-07-15T10:00:00Z'));
    [0, 1, 2].forEach((i) =>
      enc.writeMessage(20, [
        { number: 253, size: 4, baseType: FitBaseType.Uint32, value: t0 + i },
        { number: 0, size: 4, baseType: FitBaseType.Sint32, value: semi(47.1 + i * 0.001) },
        { number: 1, size: 4, baseType: FitBaseType.Sint32, value: semi(11.2) },
        { number: 2, size: 2, baseType: FitBaseType.Uint16, value: (1500 + i + 500) * 5 }
      ])
    );
    const bytes = enc.close();
    const f = await readFit(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 'ride.fit');
    expect(f.fixes).toHaveLength(3);
    expect(f.fixes[1].lat).toBeCloseTo(47.101, 5);
    expect(f.fixes[1].alt).toBeCloseTo(1501, 0);
    expect(f.date).toBe('2026-07-15');
  });
});
