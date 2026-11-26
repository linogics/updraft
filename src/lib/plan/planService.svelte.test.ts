import { afterEach, describe, expect, it } from 'vitest';

import { services } from '#lib/plugins/services';
import { PlanState } from '#lib/state/plan.svelte';

import { PLAN_SERVICE, type PlanService, providePlanService } from './planService.svelte';

describe('updraft/plan@1', () => {
  afterEach(() => services.unregisterOwner('updraft'));

  it('returns the same frozen points until the route changes', () => {
    const plan = new PlanState();
    plan.points = [{ lat: 1, lon: 2 }];
    providePlanService(plan);
    const s = services.use<PlanService>(PLAN_SERVICE);

    const first = s.points();
    expect(s.points()).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first[0])).toBe(true);
    expect(s.units()).toBe(s.units());

    plan.commit([
      { lat: 1, lon: 2 },
      { lat: 1, lon: 3 }
    ]);
    plan.speed = 40;
    expect(s.points()).not.toBe(first);
    expect(s.points()).toHaveLength(2);
    expect(s.distance()).toBe(plan.total);
    expect(s.speed()).toBe(40);
  });

  it('has events and refuses unknown ones', () => {
    providePlanService(new PlanState());
    const s = services.use<PlanService>(PLAN_SERVICE);
    for (const e of ['route', 'speed', 'units'] as const) s.on(e, () => {})();
    expect(() => s.on('x' as 'route', () => {})).toThrow('Unknown event "x" of updraft/plan@1.');
  });
});
