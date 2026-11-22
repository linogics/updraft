import { m } from '../../paraglide/messages';
import type { Flight } from '../model';
import { readFit } from './fit';
import { readGeoJson, writeGeoJson } from './geojson';
import { readGpx, writeGpx } from './gpx';
import { readIgc, writeIgc } from './igc';
import { readKml, writeKml } from './kml';
import { readTrk } from './trk';

const text = (read: (t: string, n: string) => Flight) => async (f: File) => read(await f.text(), f.name);

const READERS: Record<string, { label: string; read: (f: File) => Promise<Flight> }> = {
  igc: { label: 'IGC', read: text(readIgc) },
  gpx: { label: 'GPX', read: text(readGpx) },
  kml: { label: 'KML', read: text(readKml) },
  geojson: { label: 'GeoJSON', read: text(readGeoJson) },
  json: { label: 'GeoJSON', read: text(readGeoJson) },
  trk: { label: 'TRK', read: text(readTrk) },
  fit: { label: 'FIT', read: async (f) => readFit(await f.arrayBuffer(), f.name) }
};

const reader = (name: string) => READERS[name.split('.').pop()?.toLowerCase() ?? ''];

/** Format label for a file name, or undefined when unsupported. */
export const formatOf = (name: string) => reader(name)?.label;

export async function readTrack(file: File): Promise<Flight> {
  const r = reader(file.name);
  if (!r) throw new Error(m.format_unsupported({ name: file.name }));
  return r.read(file);
}

export const WRITERS = {
  igc: { label: 'IGC', ext: 'igc', mime: 'application/octet-stream', write: writeIgc },
  gpx: { label: 'GPX', ext: 'gpx', mime: 'application/gpx+xml', write: writeGpx },
  kml: { label: 'KML', ext: 'kml', mime: 'application/vnd.google-earth.kml+xml', write: writeKml },
  geojson: { label: 'GeoJSON', ext: 'geojson', mime: 'application/geo+json', write: writeGeoJson }
} as const;
export type WriterKey = keyof typeof WRITERS;
