import { describe, expect, it } from 'vitest';

import { PlanState } from './plan.svelte';

describe('PlanState', () => {
  it('derives legs and the total from the points', () => {
    const plan = new PlanState();
    expect(plan.legs).toEqual([]);
    plan.commit([
      { lat: 47, lon: 8 },
      { lat: 47, lon: 8.1 },
      { lat: 47.1, lon: 8.1 }
    ]);
    expect(plan.legs).toHaveLength(2);
    expect(plan.total).toBeCloseTo(plan.legs[0] + plan.legs[1]);
    expect(plan.total).toBeGreaterThan(10_000);
  });

  it('undoes a commit and clears the selection', () => {
    const plan = new PlanState();
    plan.commit([{ lat: 1, lon: 1 }]);
    plan.selected = 0;
    plan.commit([]);
    plan.undo();
    expect(plan.points).toEqual([{ lat: 1, lon: 1 }]);
    expect(plan.selected).toBeNull();
    plan.undo();
    plan.undo();
    expect(plan.points).toEqual([]);
  });
});
