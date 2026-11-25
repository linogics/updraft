import { loadPlugin } from './core';
import { pluginPrefs } from './pluginPrefs.svelte';
import { registerProvides } from './services';

let started: Promise<void> | undefined;

/**
 * Imports the installed service plugins once, because a factory is only known after the import.
 * Headless, so there is no panel that could load them later. A broken plugin is logged and skipped.
 */
export function startServicePlugins() {
  started ??= Promise.all(
    pluginPrefs.list
      .filter((e) => e.kind === 'service')
      .map(async (e) => {
        try {
          const plugin = await loadPlugin(e.url);
          if (plugin.id !== e.id || plugin.kind !== e.kind) throw new Error(`The plugin is no longer "${e.id}".`);
          registerProvides(plugin);
        } catch (err) {
          console.error(`Service plugin "${e.id}" not loaded`, err);
        }
      })
  ).then(() => {});

  return started;
}
