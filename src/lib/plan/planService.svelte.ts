import { services } from '#lib/plugins/services';
import type { PlanState } from '#lib/state/plan.svelte';
import { unitPrefs } from '#lib/state/units.svelte';
import type { Units } from '#lib/ui/units';

export const PLAN_SERVICE = 'updraft/plan@1';

/** `updraft/plan@1`. Everything is read through functions, so it is always current. */
export interface PlanService {
  /** The route. The same frozen array until the route changes. */
  points(): readonly Readonly<{ lat: number; lon: number }>[];
  /** Route length in m. */
  distance(): number;
  /** Planned speed in km/h. */
  speed(): number;
  /** The same frozen object until the user changes units. */
  units(): Readonly<Units>;
}

/** Provides `updraft/plan@1` for as long as the planner is open. Returns the unregister function. */
export function providePlanService(plan: Pick<PlanState, 'points' | 'total' | 'speed'>) {
  return services.provide(
    PLAN_SERVICE,
    (): PlanService => {
      let src: unknown;
      let points: ReturnType<PlanService['points']> = [];
      let unitsSrc: Units | undefined;
      let units: Readonly<Units>;

      return Object.freeze<PlanService>({
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
