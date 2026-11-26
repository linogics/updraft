import { m } from '../../paraglide/messages';
import type { Fix, Flight } from '../model';
import { toFlight } from './common';

interface Geometry {
  type?: string;
  coordinates?: unknown;
}

interface Feature {
  geometry?: Geometry;
  properties?: { coordTimes?: unknown; coordinateProperties?: { times?: unknown } } | null;
}

type Json = Feature & Geometry & { features?: Feature[] };

// A 4th coordinate under 1e11 is taken as unix seconds, otherwise milliseconds.
const unixToMs = (n: number) => (n < 1e11 ? n * 1000 : n);

function lineFixes(coords: number[][], times: unknown): Fix[] {
  const out: Fix[] = [];
  coords.forEach((c, i) => {
    const raw = Array.isArray(times) ? (times[i] as unknown) : c[3];
    const t = typeof raw === 'string' ? Date.parse(raw) : typeof raw === 'number' ? unixToMs(raw) : NaN;
    if (Number.isFinite(t)) out.push({ t, lat: c[1], lon: c[0], alt: c[2] ?? NaN });
  });
  return out;
}

function featureFixes(f: Feature | null | undefined): Fix[] {
  const g = f?.geometry;
  const p: NonNullable<Feature['properties']> = f?.properties ?? {};
  const times = p.coordTimes ?? p.coordinateProperties?.times;
  if (g?.type === 'LineString') return lineFixes(g.coordinates as number[][], times);

  if (g?.type === 'MultiLineString') {
    return (g.coordinates as number[][][]).flatMap((line, i) =>
      lineFixes(line, Array.isArray(times) ? times[i] : undefined)
    );
  }

  return [];
}

export function readGeoJson(text: string, sourceName: string): Flight {
  const json = JSON.parse(text) as Json;
  const features: Feature[] =
    json.type === 'FeatureCollection' ? (json.features ?? []) : json.type === 'Feature' ? [json] : [{ geometry: json }];
  const fixes = features.flatMap(featureFixes);
  if (!fixes.length) throw new Error(m.format_geojson_no_time({ name: sourceName }));
  return toFlight(sourceName, fixes);
}

export function writeGeoJson(flight: Flight): string {
  return JSON.stringify({
    type: 'Feature',
    properties: { name: flight.pilot, coordTimes: flight.fixes.map((f) => new Date(f.t).toISOString()) },
    geometry: { type: 'LineString', coordinates: flight.fixes.map((f) => [f.lon, f.lat, f.alt]) }
  });
}
