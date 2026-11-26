import type { LatLon } from '#lib/domain/geo';
import { MAX_ROUTE_POINTS } from '#lib/domain/route';
import type { PlanEvent, PlanService } from '#lib/plugins/api';
import { eventsOf } from '#lib/plugins/events.svelte';
import { services } from '#lib/plugins/services';
import type { PlanState } from '#lib/state/plan.svelte';
import { unitPrefs } from '#lib/state/units.svelte';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';
import type { Units } from '#lib/ui/units';
import { leagueOf, leagues as allLeagues } from '#lib/xc/leagues';

export type { PlanService };

export const PLAN_SERVICE = 'updraft/plan@1';

/** Provides `updraft/plan@1` for as long as the planner is open. Returns the unregister function. */
export function providePlanService(
  plan: Pick<PlanState, 'points' | 'total' | 'speed'>,
  { commit }: { commit: (next: LatLon[]) => void }
) {
  return services.provide(
    PLAN_SERVICE,
    (): PlanService => {
      let src: unknown;
      let points: ReturnType<PlanService['points']> = [];
      let unitsSrc: Units | undefined;
      let units: Readonly<Units>;

      let leaguesSrc: unknown;
      let leagueList: readonly Readonly<{ id: string; label: string }>[] = [];

      const on = eventsOf<PlanEvent>(PLAN_SERVICE, {
        route: () => void plan.points,
        speed: () => void plan.speed,
        units: () => void unitPrefs.units,
        league: () => void xcPrefs.league
      });

      return Object.freeze<PlanService>({
        on,
        points() {
          if (src !== plan.points) {
            src = plan.points;
            points = Object.freeze(plan.points.map((p) => Object.freeze({ lat: p.lat, lon: p.lon })));
          }

          return points;
        },
        distance: () => plan.total,
        speed: () => plan.speed,
        units() {
          if (unitsSrc !== unitPrefs.units) {
            unitsSrc = unitPrefs.units;
            units = Object.freeze({ ...unitsSrc });
          }

          return units;
        },
        setRoute(input) {
          if (!Array.isArray(input)) throw new Error('Route must be an array of points.');

          if (input.length > MAX_ROUTE_POINTS) {
            throw new Error(`Route has more than ${MAX_ROUTE_POINTS} points.`);
          }

          const next = input.map((p: unknown, i): LatLon => {
            const { lat, lon } = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
            if (typeof lat !== 'number' || !(lat >= -90 && lat <= 90)) {
              throw new Error(`Point ${i} needs a finite lat between -90 and 90.`);
            }

            if (typeof lon !== 'number' || !(lon >= -180 && lon <= 180)) {
              throw new Error(`Point ${i} needs a finite lon between -180 and 180.`);
            }

            return { lat, lon };
          });

          commit(next);
        },
        league: () => xcPrefs.league,
        leagues() {
          if (leaguesSrc !== allLeagues()) {
            leaguesSrc = allLeagues();
            leagueList = Object.freeze(allLeagues().map((l) => Object.freeze({ id: l.id, label: l.label })));
          }

          return leagueList;
        },
        setLeague(id) {
          const league = leagueOf(id);
          if (!league) throw new Error(`Unknown league "${id}".`);
          if (league.id !== xcPrefs.league) xcPrefs.set(league.id);
        }
      });
    },
    'updraft'
  );
}

export const PLAN_STATE_SERVICE = 'updraft/plan-state@1';

/** Provides the live `PlanState` to bundled plugins. `ctx.use` refuses it for any other plugin. */
export function providePlanState(plan: PlanState) {
  return services.provide(PLAN_STATE_SERVICE, () => plan, 'updraft');
}
