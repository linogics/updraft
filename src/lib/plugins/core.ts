import { type StudioPlugin, validateStudioPlugin } from '#lib/studio/plugins';

import { type BackendPlugin, validateBackendPlugin } from './backendKind';
import { type ConverterPlugin, validateConverterPlugin } from './converterKind';
import { type ServicePlugin, validateServicePlugin } from './serviceKind';
import { validateServiceFields } from './services';
import { validateXcPlannerPlugin, type XcPlannerPlugin } from './xcPlannerKind';

/** Grows with every new kind of plugin. Add its validator to `validators` below. */
export type PluginKind = 'studio' | 'service' | 'backend' | 'converter' | 'xc-planner';
export const PLUGIN_KINDS: readonly PluginKind[] = ['studio', 'service', 'backend', 'converter', 'xc-planner'];

/** A validated plugin module of any kind. */
export type AnyPlugin = StudioPlugin | ServicePlugin | BackendPlugin | ConverterPlugin | XcPlannerPlugin;

export const PLUGIN_ID = /^[a-z0-9-]{1,40}\/[a-z0-9-]{1,40}$/;

/** Each kind checks its own fields and its own apiVersion. */
const validators: Record<PluginKind, (mod: Record<string, unknown>) => AnyPlugin> = {
  studio: validateStudioPlugin,
  service: validateServicePlugin,
  backend: validateBackendPlugin,
  converter: validateConverterPlugin,
  'xc-planner': validateXcPlannerPlugin
};

/** Only http(s) pages can be imported. Returns the normalised URL or null. */
export function pluginUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Checks the default export of a plugin module. Throws an Error with a message for the user.
 * `taken` are ids that are already in use, by plugins of any kind.
 */
export function validatePlugin(mod: unknown, taken: readonly string[] = []): AnyPlugin {
  if (!mod || typeof mod !== 'object') throw new Error('The module has no default export object.');
  const p = mod as Record<string, unknown>;
  if (typeof p.id !== 'string' || !PLUGIN_ID.test(p.id)) {
    throw new Error('"id" must look like "vendor/name", each part 1 to 40 characters from a-z, 0-9 and "-".');
  }

  if (typeof p.name !== 'string' || !p.name.trim()) throw new Error('"name" must be a non-empty string.');

  if (!PLUGIN_KINDS.includes(p.kind as PluginKind)) {
    throw new Error(`"kind" must be one of ${PLUGIN_KINDS.map((k) => `"${k}"`).join(', ')}.`);
  }

  if (taken.includes(p.id)) throw new Error(`The id "${p.id}" is already in use.`);
  validateServiceFields(p);
  return validators[p.kind as PluginKind](p);
}

// One import per URL for the whole session, a module cannot be evaluated twice anyway.
// Plain cache, nothing renders from it.
const loaded = new Map<string, Promise<AnyPlugin>>();

/** Imports and validates the plugin at `url`. Throws an Error with a message for the user. */
export function loadPlugin(url: string, taken: readonly string[] = []): Promise<AnyPlugin> {
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

async function importPlugin(raw: string): Promise<AnyPlugin> {
  const url = pluginUrl(raw);
  if (!url) throw new Error('The address must be a valid http or https URL.');
  let mod: { default?: unknown };
  try {
    // Full trust by design, the user confirmed it. SRI cannot cover a user given import().
    // eslint-disable-next-line no-unsanitized/method -- http(s) only via pluginUrl, user confirmed
    mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
  } catch (err) {
    throw new Error(`Could not load the plugin. ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  return validatePlugin(mod.default);
}
