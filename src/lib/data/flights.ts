import type { FlightsEvent, FlightsService } from '#lib/plugins/api';
import { flightsSchema } from '#lib/plugins/coreSchemas';
import { services } from '#lib/plugins/services';
import { flightRepository } from '#lib/storage';
import { onLocalChange } from '#lib/storage/localChange';
import { syncClient } from '#lib/sync/client.svelte';

export type { FlightsService };

export const FLIGHTS_SERVICE = 'updraft/flights@1';

/** Provides `updraft/flights@1` on top of the local logbook. Returns the unregister function. */
export function provideFlightsService(repo = flightRepository) {
  return services.provide(
    FLIGHTS_SERVICE,
    (): FlightsService =>
      Object.freeze<FlightsService>({
        on(event: FlightsEvent, fn) {
          if (event !== 'changed') throw new Error(`Unknown event "${String(event)}" of ${FLIGHTS_SERVICE}.`);
          // Local writes notify directly, a pull from the server only through the sync client.
          const offs = [onLocalChange(fn), syncClient.onApplied(() => fn())];
          return () => offs.forEach((off) => off());
        },
        list: () => repo.list(),
        // shortcut: scans the listing, add an indexed lookup to the repository when logbooks get large.
        get: async (id) => (await repo.list()).find((f) => f.id === id) ?? null,
        track: async (id) => (await repo.get(id))?.fixes ?? null,
        async save(flight) {
          if (!flight.fixes?.length) throw new Error('A flight needs at least one fix.');
          await repo.save(flight);
          return flight.id;
        },
        async saveManual(entry) {
          const id = entry.id ?? crypto.randomUUID();
          await repo.saveManual({ ...entry, id });
          return id;
        },
        updateMeta: (id, patch) => repo.updateMeta(id, patch),
        delete: (id) => repo.delete(id)
      }),
    'updraft',
    flightsSchema
  );
}
