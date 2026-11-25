import { services } from '#lib/plugins/services';
import type { FlightStats } from '#lib/domain/model';
import type { TransitionSummary } from '#lib/domain/analysis/transitions';
import type { AltRef } from '#lib/state/altRefPrefs';
import type { StudioState } from '#lib/state/studio.svelte';

export const ANALYSIS_SERVICE = 'updraft/flight-analysis@1';

export type { FlightStats, TransitionSummary };

/** `updraft/flight-analysis@1`. Lookups by flight id, null for an unknown id. Results are shared with the studio, read only. */
export interface AnalysisService {
  stats(id: string): FlightStats | null;
  /** AGL values are null until ground heights have loaded, so hold `ctx.need('ground')` while asking for them. */
  transitions(id: string, ref: AltRef): TransitionSummary | null;
}

type Host = Pick<StudioState, 'flights' | 'transitionSummary'>;

/** Provides `updraft/flight-analysis@1` for as long as the studio is open. Returns the unregister function. */
export function provideAnalysisService(studio: Host) {
  const find = (id: string) => studio.flights.find((lf) => lf.flight.id === id);

  return services.provide(
    ANALYSIS_SERVICE,
    () =>
      Object.freeze<AnalysisService>({
        stats: (id) => find(id)?.analysis.stats ?? null,
        transitions(id, ref) {
          const lf = find(id);
          return lf ? studio.transitionSummary(lf, ref === 'agl') : null;
        }
      }),
    'updraft'
  );
}
