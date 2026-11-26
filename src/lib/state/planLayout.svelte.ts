import { planRegistry } from '#lib/plan/registry.svelte';

import { PageLayout } from './pageLayout.svelte';

/** Legs is a page panel, not a plugin, it only shows while the route has legs. */
export const LEGS_PANEL = 'legs';

export const planLayout = new PageLayout(
  'planLayout',
  { main: [...planRegistry.bundled, LEGS_PANEL] },
  planRegistry.collapsed,
  () => planRegistry.user.map((p) => p.id)
);
