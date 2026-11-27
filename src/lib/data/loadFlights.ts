import type { Flight } from '#lib/domain/model';
import type { FlightsService } from '#lib/plugins/api';
import { services } from '#lib/plugins/services';

/** Loads stored flights with their tracks. Ids that are unknown or manual are left out. */
export async function loadFlights(ids: string[]): Promise<Flight[]> {
  const flights = services.use<FlightsService>('updraft/flights@1');
  const loaded = await Promise.all(
    ids.map(async (id): Promise<Flight | null> => {
      const [meta, fixes] = await Promise.all([flights.get(id), flights.track(id)]);
      if (!meta || !fixes) return null;

      const { sourceName, pilot, glider, site, date, notes, clubs } = meta;
      // The service returns shared data, the studio gets its own list.
      return { id, sourceName, pilot, glider, site, date, notes, clubs, fixes: [...fixes] };
    })
  );

  return loaded.filter((f): f is Flight => !!f);
}
