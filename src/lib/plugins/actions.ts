import { clashOf } from '#lib/convert/registry';
import { planLayout } from '#lib/state/planLayout.svelte';
import { studioLayout } from '#lib/state/studioLayout.svelte';
import { pluginPanelId } from '#lib/studio/registry.svelte';

import { BUILTIN_BACKENDS, BUILTIN_CONVERTERS, BUILTIN_PLUGINS, BUILTIN_XC_PLANNERS } from './builtin';
import { cachePlugin, uncachePlugin } from './cache';
import { forgetPluginModule, loadPlugin, type PluginKind, pluginUrl } from './core';
import { pluginPrefs } from './pluginPrefs.svelte';
import { assertNotReserved, registerProvides, services } from './services';

/**
 * Loads and validates the plugin at `raw`, then stores it. A studio plugin also shows its panel in its start dock.
 * Throws an Error with a message for the user and changes nothing when anything is wrong.
 * With `kinds`, a plugin of another kind is refused, for pages that only take one kind.
 */
export async function addPlugin(raw: string, { kinds }: { kinds?: PluginKind[] } = {}) {
  const url = pluginUrl(raw);
  if (!url) throw new Error('The address must be a valid http or https URL.');
  if (pluginPrefs.list.some((e) => e.url === url)) throw new Error('This plugin is already added.');

  // Ids are unique across all kinds. Bundled plugin ids are refused too.
  const taken = [
    ...BUILTIN_PLUGINS.map((p) => p.id),
    ...BUILTIN_BACKENDS.map((p) => p.id),
    ...BUILTIN_CONVERTERS.map((p) => p.id),
    ...BUILTIN_XC_PLANNERS.map((p) => p.id),
    ...pluginPrefs.list.map((e) => e.id)
  ];
  const plugin = await loadPlugin(url, taken);
  if (kinds && !kinds.includes(plugin.kind)) throw new Error(`This page only accepts ${kinds.join(' or ')} plugins.`);
  assertNotReserved(plugin);
  const { id, kind } = plugin;
  const name = plugin.name.trim();
  // Before anything is stored, a duplicate service name makes this throw.
  registerProvides(plugin);
  switch (plugin.kind) {
    case 'studio':
      pluginPrefs.add({ url, id, name, kind, dock: plugin.dock, hosts: plugin.hosts });
      // A planner only plugin has no studio panel.
      if (!plugin.hosts || plugin.hosts.includes('studio')) studioLayout.move(pluginPanelId(id), plugin.dock, Infinity);
      break;

    case 'converter': {
      const { label, extensions, mime } = plugin;
      const clash = clashOf(extensions);
      if (clash) throw new Error(`The extension ".${clash.ext}" is already handled by ${clash.c.label}.`);
      pluginPrefs.add({
        url,
        id,
        name,
        kind,
        label: label.trim(),
        extensions: [...extensions],
        canRead: !!plugin.read,
        canWrite: !!plugin.write,
        ...(mime && { mime })
      });
      break;
    }

    case 'xc-planner':
      pluginPrefs.add({
        url,
        id,
        name,
        kind,
        exports: (plugin.exports ?? []).map(({ label, extension, mime }) => ({
          label: label.trim(),
          extension,
          ...(mime && { mime })
        }))
      });
      break;

    case 'service':
    case 'backend':
      pluginPrefs.add({ url, id, name, kind });
      break;
  }

  await cachePlugin(url);
}

/** Removes the plugin from the list, the layout and the offline cache. A studio panel unmounts. */
export function removePlugin(id: string) {
  const entry = pluginPrefs.list.find((e) => e.id === id);
  if (!entry) return;

  if (entry.kind === 'studio') {
    studioLayout.forget(pluginPanelId(id));
    if (entry.hosts?.includes('plan')) planLayout.forget(pluginPanelId(id));
  }

  pluginPrefs.remove(id);
  services.unregisterOwner(id);
  forgetPluginModule(entry.url);
  void uncachePlugin(entry.url);
}
