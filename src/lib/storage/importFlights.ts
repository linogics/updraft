import { readTrack } from '../domain/formats';
import { DEFAULT_SCENE, encodeScene } from '../domain/scene';
import { flightRepository } from './index';

/** Parses and stores track files of any supported format. Bad files are reported, the rest are still saved. */
export async function importFlights(files: File[]): Promise<{ ids: string[]; errors: string[] }> {
  const ids: string[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const flight = await readTrack(file);
      await flightRepository.save(flight);
      ids.push(flight.id);
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { ids, errors };
}

/** Replay URL for a set of flights with the default scene. */
export const replayHref = (ids: string[]) => `/replay?${encodeScene({ ...DEFAULT_SCENE, flightIds: ids })}`;
