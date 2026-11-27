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
    (): FlightsService => {
      const flights: FlightsService = Object.freeze<FlightsService>({
        on(event: FlightsEvent, fn) {
          if (event !== 'changed') throw new Error(`Unknown event "${String(event)}" of ${FLIGHTS_SERVICE}.`);
          // Local writes notify directly, a pull from the server only through the sync client.
          const offs = [onLocalChange(fn), syncClient.onApplied(() => fn())];
          return () => offs.forEach((off) => off());
        },
        // The club summary is the app's own, plugins see the public fields only.
        list: async () => (await repo.list()).map(({ club: _club, ...s }) => s),
        // shortcut: scans the listing, add an indexed lookup to the repository when logbooks get large.
        get: async (id) => (await flights.list()).find((f) => f.id === id) ?? null,
        async track(id) {
          const local = (await repo.get(id))?.fixes;
          if (local) return local;
          if (!(await repo.summary(id))?.hasTrack) return null;

          // A flight from another device has its track on the server only until the first time it is opened.
          try {
            return await syncClient.fetchTrack(id);
          } catch (e) {
            console.error('Could not load the track', e);
            return null;
          }
        },
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
      });
      return flights;
    },
    'updraft',
    flightsSchema
  );
}
