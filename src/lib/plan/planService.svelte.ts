import type { PlanEvent, PlanService } from '#lib/plugins/api';
import { eventsOf } from '#lib/plugins/events.svelte';
import { services } from '#lib/plugins/services';
import type { PlanState } from '#lib/state/plan.svelte';
import { unitPrefs } from '#lib/state/units.svelte';
import type { Units } from '#lib/ui/units';

export type { PlanService };

export const PLAN_SERVICE = 'updraft/plan@1';

/** Provides `updraft/plan@1` for as long as the planner is open. Returns the unregister function. */
export function providePlanService(plan: Pick<PlanState, 'points' | 'total' | 'speed'>) {
  return services.provide(
    PLAN_SERVICE,
    (): PlanService => {
      let src: unknown;
      let points: ReturnType<PlanService['points']> = [];
      let unitsSrc: Units | undefined;
      let units: Readonly<Units>;

      const on = eventsOf<PlanEvent>(PLAN_SERVICE, {
        route: () => void plan.points,
        speed: () => void plan.speed,
        units: () => void unitPrefs.units
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
