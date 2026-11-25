import { studioLayout } from '#lib/state/studioLayout.svelte';
import { BUILTIN_PANELS } from '#lib/studio/panels';
import { pluginPanelId } from '#lib/studio/registry.svelte';
import { cachePlugin, uncachePlugin } from './cache';
import { forgetPluginModule, loadPlugin, pluginUrl } from './core';
import { pluginPrefs } from './pluginPrefs.svelte';

/**
 * Loads and validates the plugin at `raw`, then stores it. A studio plugin also shows its panel in its start dock.
 * Throws an Error with a message for the user and changes nothing when anything is wrong.
 */
export async function addPlugin(raw: string) {
  const url = pluginUrl(raw);
  if (!url) throw new Error('The address must be a valid http or https URL.');
  if (pluginPrefs.list.some((e) => e.url === url)) throw new Error('This plugin is already added.');

  // Ids are unique across all kinds. Built-in panel ids are refused too, to avoid confusion.
  const taken = [...BUILTIN_PANELS.map((p) => p.id), ...pluginPrefs.list.map((e) => e.id)];
  const plugin = await loadPlugin(url, taken);
  const { id, kind } = plugin;
  const name = plugin.name.trim();
  switch (plugin.kind) {
    case 'studio':
      pluginPrefs.add({ url, id, name, kind, dock: plugin.dock });
      studioLayout.move(pluginPanelId(id), plugin.dock, Infinity);
      break;
  }

  await cachePlugin(url);
}

/** Removes the plugin from the list, the layout and the offline cache. A studio panel unmounts. */
export function removePlugin(id: string) {
  const entry = pluginPrefs.list.find((e) => e.id === id);
  if (!entry) return;
  if (entry.kind === 'studio') studioLayout.forget(pluginPanelId(id));
  pluginPrefs.remove(id);
  forgetPluginModule(entry.url);
  void uncachePlugin(entry.url);
}
