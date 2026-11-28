import { describe, expect, it } from 'vitest';

import { registry } from '#lib/studio/registry.svelte';

import { planRegistry } from './registry.svelte';

describe('planner registry', () => {
  it('lists the bundled planner panels in order, collapsed', () => {
    expect(planRegistry.bundled).toEqual([
      'plugin:updraft/thermal-overlay',
      'plugin:updraft/plan-xc',
      'plugin:updraft/glide',
      'plugin:updraft/airspace',
      'plugin:updraft/plan-export'
    ]);
    expect(planRegistry.collapsed).toEqual(planRegistry.bundled.slice(0, 4));
  });

  it('keeps planner only plugins out of the studio', () => {
    expect(registry.byId.has('plugin:updraft/plan-xc')).toBe(false);
    expect(registry.byId.has('plugin:updraft/airspace')).toBe(true);
  });
});
