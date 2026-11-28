import { BUILTIN_PLUGINS } from '#lib/plugins/builtin';
import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';
import type { PanelDef } from '#lib/studio/panels';
import { builtinPanel, pluginPanel } from '#lib/studio/registry.svelte';

/** Default order of the bundled planner panels. */
const ORDER = [
  'updraft/thermal-overlay',
  'updraft/plan-xc',
  'updraft/glide',
  'updraft/airspace',
  'updraft/plan-export'
];

const BUILTINS: PanelDef[] = BUILTIN_PLUGINS.filter((b) => b.hosts?.includes('plan'))
  .sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))
  .map(builtinPanel);

/** Bundled planner panels followed by the plugins the user added for the planner. Follows the plugin list. */
class PlanRegistry {
  /** Bundled panel ids, they cannot be removed. */
  bundled = BUILTINS.map((p) => p.id);
  /** Ids that start folded to their header. */
  collapsed = BUILTINS.filter((p) => p.collapsed).map((p) => p.id);
  /** The plugins the user added. */
  user = $derived<PanelDef[]>(
    pluginPrefs.list.filter((e) => e.kind === 'studio' && e.hosts?.includes('plan')).map(pluginPanel)
  );
  list = $derived<PanelDef[]>([...BUILTINS, ...this.user]);
  byId = $derived(new Map(this.list.map((p) => [p.id, p])));
}

export const planRegistry = new PlanRegistry();
