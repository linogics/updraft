import { pluginPrefs } from '#lib/state/pluginPrefs.svelte';
import type { PluginEntry } from '#lib/state/pluginPrefs';
import { BUILTIN_PANELS, type PanelDef, type PanelModule } from './panels';
import { loadPlugin } from './plugins';

/** Plugin panel ids carry this prefix, so they never clash with a built-in id now or later. */
export const PLUGIN_PREFIX = 'plugin:';
export const pluginPanelId = (id: string) => PLUGIN_PREFIX + id;

// The same object for the same plugin, so a panel that stays does not reload when the list changes.
// Plain cache, nothing renders from it.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const defs = new Map<string, PanelDef>();

function pluginPanel(e: PluginEntry): PanelDef {
  const key = `${e.url}\n${e.id}\n${e.name}`;
  const hit = defs.get(key);
  if (hit) return hit;

  const def: PanelDef = {
    id: pluginPanelId(e.id),
    key,
    title: () => e.name,
    dock: e.dock,
    load: async () => {
      const plugin = await loadPlugin(e.url);
      if (plugin.id !== e.id) throw new Error(`The plugin now has the id "${plugin.id}" instead of "${e.id}".`);
      const { default: host } = await import('#lib/components/studio/PluginPanel.svelte');
      // The host takes the plugin as a prop on top of the studio, which PanelHost passes from `props`.
      return { default: host as unknown as PanelModule['default'], props: { plugin } };
    }
  };
  defs.set(key, def);
  return def;
}

/** Built-in panels followed by the plugins the user added. Follows the plugin list. */
class Registry {
  list = $derived<PanelDef[]>([...BUILTIN_PANELS, ...pluginPrefs.list.map(pluginPanel)]);
  byId = $derived(new Map(this.list.map((p) => [p.id, p])));
  /** Ids that may not leave their default dock. */
  pinned = $derived(this.list.filter((p) => p.pinned).map((p) => p.id));
  /** Default dock per panel id, the shape the layout state validates against. */
  defaults = $derived<Record<string, PanelDef['dock']>>(Object.fromEntries(this.list.map((p) => [p.id, p.dock])));
}

export const registry = new Registry();

export const panelById = (id: string) => registry.byId.get(id);

export const pluginEntry = (panelId: string) => pluginPrefs.list.find((e) => pluginPanelId(e.id) === panelId);
