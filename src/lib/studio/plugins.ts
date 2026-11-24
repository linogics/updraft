import { PLUGIN_DOCKS, PLUGIN_ID, pluginUrl, type PluginDock } from '#lib/state/pluginPrefs';
import type { PluginContext } from './pluginContext.svelte';

export const PLUGIN_API_VERSION = 1;

export interface Plugin {
  id: string;
  name: string;
  apiVersion: 1;
  dock: PluginDock;
  /** Returns the function that tears the plugin down. */
  mount(el: HTMLElement, ctx: PluginContext): void | (() => void);
  drawExport?(ctx2d: CanvasRenderingContext2D, time: number): void;
}

/**
 * Checks the default export of a plugin module. Throws an Error with a message for the user.
 * `taken` are ids that are already in use.
 */
export function validatePlugin(mod: unknown, taken: readonly string[] = []): Plugin {
  if (!mod || typeof mod !== 'object') throw new Error('The module has no default export object.');
  const p = mod as Record<string, unknown>;
  if (typeof p.id !== 'string' || !PLUGIN_ID.test(p.id))
    throw new Error('"id" must be 1 to 40 characters from a-z, 0-9 and "-".');
  if (typeof p.name !== 'string' || !p.name.trim()) throw new Error('"name" must be a non-empty string.');
  if (p.apiVersion !== PLUGIN_API_VERSION)
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, this studio supports ${PLUGIN_API_VERSION}.`);
  if (!PLUGIN_DOCKS.includes(p.dock as PluginDock)) throw new Error('"dock" must be "left", "right" or "bottom".');
  if (typeof p.mount !== 'function') throw new Error('"mount" must be a function.');
  if (p.drawExport !== undefined && typeof p.drawExport !== 'function')
    throw new Error('"drawExport" must be a function when present.');
  if (taken.includes(p.id)) throw new Error(`The id "${p.id}" is already in use.`);
  return p as unknown as Plugin;
}

// One import per URL for the whole session, a module cannot be evaluated twice anyway.
// Plain cache, nothing renders from it.
const loaded = new Map<string, Promise<Plugin>>();

/** Imports and validates the plugin at `url`. Throws an Error with a message for the user. */
export function loadPlugin(url: string, taken: readonly string[] = []): Promise<Plugin> {
  let p = loaded.get(url);
  if (!p) {
    p = importPlugin(url);
    loaded.set(url, p);
    // A failed import can be retried.
    p.catch(() => loaded.delete(url));
  }

  return p.then((plugin) => validatePlugin(plugin, taken));
}

export const forgetPluginModule = (url: string) => loaded.delete(url);

async function importPlugin(raw: string): Promise<Plugin> {
  const url = pluginUrl(raw);
  if (!url) throw new Error('The address must be a valid http or https URL.');
  let mod: { default?: unknown };
  try {
    // Full trust by design, the user confirmed it. SRI cannot cover a user given import().
    mod = await import(/* @vite-ignore */ url);
  } catch (err) {
    throw new Error(`Could not load the plugin. ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  return validatePlugin(mod.default);
}
