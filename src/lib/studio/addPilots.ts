import { loadFlights } from '#lib/data/loadFlights';
import type { StudioState } from '#lib/state/studio.svelte';
import { importFlights } from '#lib/storage/importFlights';

/** Loads stored flights by id and adds those that are not in the studio yet. */
export async function addStored(studio: StudioState, ids: string[]) {
  const loaded = new Set(studio.flights.map((f) => f.source.id));
  studio.addFlights(await loadFlights(ids.filter((id) => !loaded.has(id))));
}

/** Imports track files into the logbook and adds them to the studio. Returns the import errors. */
export async function importAndAdd(studio: StudioState, files: File[]): Promise<string[]> {
  const { ids, errors } = await importFlights(files);
  await addStored(studio, ids);
  return errors;
}
