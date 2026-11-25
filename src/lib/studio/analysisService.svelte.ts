import { eventsOf } from '#lib/plugins/events.svelte';
import { services } from '#lib/plugins/services';
import type { FlightStats } from '#lib/domain/model';
import type { TransitionSummary } from '#lib/domain/analysis/transitions';
import type { AnalysisEvent, AnalysisService } from '#lib/plugins/api';
import type { StudioState } from '#lib/state/studio.svelte';

export const ANALYSIS_SERVICE = 'updraft/flight-analysis@1';

export type { AnalysisService, FlightStats, TransitionSummary };

type Host = Pick<StudioState, 'flights' | 'transitionSummary'>;

/** Provides `updraft/flight-analysis@1` for as long as the studio is open. Returns the unregister function. */
export function provideAnalysisService(studio: Host) {
  const find = (id: string) => studio.flights.find((lf) => lf.flight.id === id);

  return services.provide(
    ANALYSIS_SERVICE,
    () =>
      Object.freeze<AnalysisService>({
        // Flights are replaced on every change, ground heights arriving included.
        on: eventsOf<AnalysisEvent>(ANALYSIS_SERVICE, { changed: () => void studio.flights }),
        stats: (id) => find(id)?.analysis.stats ?? null,
        transitions(id, ref) {
          const lf = find(id);
          return lf ? studio.transitionSummary(lf, ref === 'agl') : null;
        }
      }),
    'updraft'
  );
}
