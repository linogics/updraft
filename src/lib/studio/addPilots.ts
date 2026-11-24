import type { Flight } from '#lib/domain/model';
import type { StudioState } from '#lib/state/studio.svelte';
import { flightRepository } from '#lib/storage';
import { importFlights } from '#lib/storage/importFlights';

/** Loads stored flights by id and adds those that are not in the studio yet. */
export async function addStored(studio: StudioState, ids: string[]) {
  const loaded = new Set(studio.flights.map((f) => f.source.id));
  const flights = await Promise.all(ids.filter((id) => !loaded.has(id)).map((id) => flightRepository.get(id)));
  studio.addFlights(flights.filter((f): f is Flight => !!f));
}

/** Imports track files into the logbook and adds them to the studio. Returns the import errors. */
export async function importAndAdd(studio: StudioState, files: File[]): Promise<string[]> {
  const { ids, errors } = await importFlights(files);
  await addStored(studio, ids);
  return errors;
}
