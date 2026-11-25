import { loadPlugin, validatePlugin } from '#lib/plugins/core';
import type { PluginEntry } from '#lib/plugins/entries';
import { startServicePlugins } from '#lib/plugins/startup';
import { registerProvides } from '#lib/plugins/services';
import { BUILTIN_PLUGINS, type BuiltinPlugin } from '#lib/plugins/builtin';
import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';
import type { StudioPlugin } from './plugins';
import { BUILTIN_PANELS, type PanelDef, type PanelModule } from './panels';

/** Plugin panel ids carry this prefix, so they never clash with a built-in id now or later. */
export const PLUGIN_PREFIX = 'plugin:';
export const pluginPanelId = (id: string) => PLUGIN_PREFIX + id;

// The same object for the same plugin, so a panel that stays does not reload when the list changes.
// Plain cache, nothing renders from it.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const defs = new Map<string, PanelDef>();

async function hostProps(plugin: StudioPlugin) {
  const { default: host } = await import('#lib/components/studio/PluginPanel.svelte');
  // The host takes the plugin as a prop on top of the studio, which PanelHost passes from `props`.
  return { default: host as unknown as PanelModule['default'], props: { plugin } };
}

const builtinPanel = (b: BuiltinPlugin): PanelDef => ({
  id: pluginPanelId(b.id),
  title: b.title,
  dock: b.dock,
  hidden: b.hidden,
  collapsed: b.collapsed,
  pinned: b.pinned,
  enable: b.enable,
  startsOff: b.startsOff,
  load: async () => {
    const plugin = validatePlugin((await b.load()).default);
    if (plugin.kind !== 'studio' || plugin.id !== b.id) throw new Error(`"${b.id}" is not the expected studio plugin.`);
    return hostProps(plugin);
  }
});

// Bundled plugins keep the place in the default order that their panel had before it became a plugin.
const BUILTINS: PanelDef[] = [...BUILTIN_PANELS];
for (const b of BUILTIN_PLUGINS.filter((b) => b.hosts?.includes('studio') ?? true)) {
  const at = BUILTINS.findIndex((p) => p.id === b.after);
  BUILTINS.splice(at < 0 ? BUILTINS.length : at + 1, 0, builtinPanel(b));
}

function pluginPanel(e: PluginEntry): PanelDef {
  const key = `${e.url}\n${e.id}\n${e.name}`;
  const hit = defs.get(key);
  if (hit) return hit;

  const def: PanelDef = {
    id: pluginPanelId(e.id),
    key,
    title: () => e.name,
    dock: e.dock ?? 'right',
    load: async () => {
      // Service plugins may provide what this one requires.
      await startServicePlugins();
      const plugin = await loadPlugin(e.url);
      if (plugin.kind !== e.kind)
        throw new Error(`The plugin now has the kind "${plugin.kind}" instead of "${e.kind}".`);
      if (plugin.id !== e.id) throw new Error(`The plugin now has the id "${plugin.id}" instead of "${e.id}".`);
      registerProvides(plugin);
      if (plugin.kind !== 'studio') throw new Error(`"${e.id}" is not a studio plugin.`);

      return hostProps(plugin);
    }
  };
  defs.set(key, def);
  return def;
}

/** Built-in panels and bundled plugins followed by the plugins the user added. Follows the plugin list. */
class Registry {
  list = $derived<PanelDef[]>([
    ...BUILTINS,
    ...pluginPrefs.list
      .filter((e) => e.kind === 'studio' && (e.hosts ?? ['studio']).includes('studio'))
      .map(pluginPanel)
  ]);
  byId = $derived(new Map(this.list.map((p) => [p.id, p])));
  /** Ids that may not leave their default dock. */
  pinned = $derived(this.list.filter((p) => p.pinned).map((p) => p.id));
  /** Ids that start hidden, the user turns them on from the Panels menu. */
  hidden = $derived(this.list.filter((p) => p.hidden).map((p) => p.id));
  /** Ids that start folded to their header. */
  collapsed = $derived(this.list.filter((p) => p.collapsed).map((p) => p.id));
  /** Default dock per panel id, the shape the layout state validates against. */
  defaults = $derived<Record<string, PanelDef['dock']>>(Object.fromEntries(this.list.map((p) => [p.id, p.dock])));
}

export const registry = new Registry();

export const panelById = (id: string) => registry.byId.get(id);

export const pluginEntry = (panelId: string) => pluginPrefs.list.find((e) => pluginPanelId(e.id) === panelId);
