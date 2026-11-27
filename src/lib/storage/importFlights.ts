import { readTrack } from '../convert/registry';
import { DEFAULT_SCENE, encodeScene } from '../domain/scene';
import type { Original } from '../sync/types';
import { flightRepository } from './index';

const TYPES: Record<string, string> = {
  igc: 'application/vnd.fai.igc',
  gpx: 'application/gpx+xml',
  kml: 'application/vnd.google-earth.kml+xml'
};

/** The file as it was imported, so another device can parse it again. */
export async function originalOf(file: File, id: string): Promise<Original> {
  const type = TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? (file.type || 'application/octet-stream');
  return { id, type, bytes: await file.arrayBuffer() };
}

/** Parses and stores track files of any supported format. Bad files are reported, the rest are still saved. */
export async function importFlights(files: File[]): Promise<{ ids: string[]; errors: string[] }> {
  performance.mark('updraft:import-start');
  const ids: string[] = [];
  const errors: string[] = [];
  // The same track imported again opens the stored flight instead of adding a copy.
  const trackKey = (start: number, end: number, count: number) => `${start}|${end}|${count}`;
  const known = new Map(
    (await flightRepository.list()).map((s) => [trackKey(s.startTime, s.endTime, s.fixCount), s.id])
  );

  for (const file of files) {
    try {
      const flight = await readTrack(file);
      const { fixes } = flight;
      const key = trackKey(fixes[0].t, fixes[fixes.length - 1].t, fixes.length);
      const existing = known.get(key);
      if (existing) {
        ids.push(existing);
        continue;
      }

      await flightRepository.save(flight, await originalOf(file, flight.id));
      known.set(key, flight.id);
      ids.push(flight.id);
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Installed apps and Safari home-screen apps keep IndexedDB from eviction, persist asks the browser to keep the logbook too.
  if (ids.length && typeof navigator !== 'undefined') {
    try {
      navigator.storage?.persist?.().catch(() => {});
    } catch {
      // Persistence is only a hint, a failed request must not fail the import.
    }
  }

  // Perf runs read this mark to time parse and store apart from studio startup.
  performance.mark('updraft:imported');
  return { ids, errors };
}

/** Studio URL for a set of flights with the default scene. */
export const studioHref = (ids: string[]) => `/studio?${encodeScene({ ...DEFAULT_SCENE, flightIds: ids })}`;
