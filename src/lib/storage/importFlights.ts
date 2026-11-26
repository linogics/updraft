import { readTrack } from '../domain/formats';
import { DEFAULT_SCENE, encodeScene } from '../domain/scene';
import { flightRepository } from './index';

/** Parses and stores track files of any supported format. Bad files are reported, the rest are still saved. */
export async function importFlights(files: File[]): Promise<{ ids: string[]; errors: string[] }> {
  performance.mark('updraft:import-start');
  const ids: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const flight = await readTrack(file);
      await flightRepository.save(flight);
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
