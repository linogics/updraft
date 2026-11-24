import { pluginPrefs } from '#lib/state/pluginPrefs.svelte';
import { pluginUrl } from '#lib/state/pluginPrefs';
import { studioLayout } from '#lib/state/studioLayout.svelte';
import { BUILTIN_PANELS } from './panels';
import { cachePlugin, uncachePlugin } from './pluginCache';
import { forgetPluginModule, loadPlugin } from './plugins';
import { pluginPanelId } from './registry.svelte';

/**
 * Loads and validates the plugin at `raw`, then stores it and shows its panel in its start dock.
 * Throws an Error with a message for the user and changes nothing when anything is wrong.
 */
export async function addPlugin(raw: string) {
  const url = pluginUrl(raw);
  if (!url) throw new Error('The address must be a valid http or https URL.');
  if (pluginPrefs.list.some((e) => e.url === url)) throw new Error('This plugin is already added.');

  // Ids are prefixed internally, so only another plugin can clash. Built-in ids are refused too, to avoid confusion.
  const taken = [...BUILTIN_PANELS.map((p) => p.id), ...pluginPrefs.list.map((e) => e.id)];
  const { id, name, dock } = await loadPlugin(url, taken);
  pluginPrefs.add({ url, id, name: name.trim(), dock });
  studioLayout.move(pluginPanelId(id), dock, Infinity);
  await cachePlugin(url);
}

/** Removes the plugin from the list, the layout and the offline cache. Its panel unmounts. */
export function removePlugin(id: string) {
  const entry = pluginPrefs.list.find((e) => e.id === id);
  if (!entry) return;
  studioLayout.forget(pluginPanelId(id));
  pluginPrefs.remove(id);
  forgetPluginModule(entry.url);
  void uncachePlugin(entry.url);
}
