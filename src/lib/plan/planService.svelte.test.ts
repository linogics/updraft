import { afterEach, describe, expect, it } from 'vitest';

import { services } from '#lib/plugins/services';
import { PlanState } from '#lib/state/plan.svelte';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';

import { PLAN_SERVICE, type PlanService, providePlanService } from './planService.svelte';

describe('updraft/plan@1', () => {
  afterEach(() => services.unregisterOwner('updraft'));

  it('returns the same frozen points until the route changes', () => {
    const plan = new PlanState();
    plan.points = [{ lat: 1, lon: 2 }];
    providePlanService(plan, { commit: (n) => plan.commit(n) });
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
    providePlanService(new PlanState(), { commit: () => {} });
    const s = services.use<PlanService>(PLAN_SERVICE);
    for (const e of ['route', 'speed', 'units', 'league'] as const) s.on(e, () => {})();
    expect(() => s.on('x' as 'route', () => {})).toThrow('Unknown event "x" of updraft/plan@1.');
  });

  describe('writes', () => {
    const setup = () => {
      const plan = new PlanState();
      plan.points = [{ lat: 1, lon: 2 }];
      providePlanService(plan, { commit: (n) => plan.commit(n) });

      return { plan, s: services.use<PlanService>(PLAN_SERVICE) };
    };

    it('replaces the route as one undo step and copies points', () => {
      const { plan, s } = setup();
      const input = [
        { lat: 3, lon: 4 },
        { lat: 5, lon: 6 }
      ];
      s.setRoute(input);
      input[0].lat = 50;
      expect(plan.points).toEqual([
        { lat: 3, lon: 4 },
        { lat: 5, lon: 6 }
      ]);
      plan.undo();
      expect(plan.points).toEqual([{ lat: 1, lon: 2 }]);
    });

    it('clears with an empty array', () => {
      const { plan, s } = setup();
      s.setRoute([]);
      expect(plan.points).toEqual([]);
    });

    it('rejects bad routes', () => {
      const { plan, s } = setup();
      const bad: unknown[] = [
        'x',
        Array.from({ length: 101 }, () => ({ lat: 0, lon: 0 })),
        [{ lat: NaN, lon: 0 }],
        [{ lat: 91, lon: 0 }],
        [{ lat: 0, lon: -181 }],
        [{ lat: 0 }],
        [null]
      ];
      for (const b of bad) expect(() => s.setRoute(b as never)).toThrow(Error);
      expect(plan.points).toEqual([{ lat: 1, lon: 2 }]);
    });

    it('has a frozen stable league list and switches league', () => {
      const { s } = setup();
      const before = xcPrefs.league;
      expect(Object.isFrozen(s.leagues())).toBe(true);
      expect(s.leagues()).toBe(s.leagues());
      try {
        s.setLeague('FFVL');
        expect(xcPrefs.league).toBe('FFVL');
        expect(s.league()).toBe('FFVL');
        s.setLeague('FFVL');
        expect(() => s.setLeague('nope')).toThrow('Unknown league "nope".');
      } finally {
        xcPrefs.set(before);
      }
    });
  });
});
