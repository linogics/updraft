import type { PluginDock, PluginHost, StudioPlugin } from '#lib/plugins/api';

export type { PluginDock, PluginHost, StudioPlugin };
export const PLUGIN_HOSTS: readonly PluginHost[] = ['studio', 'plan'];
export const PLUGIN_DOCKS: readonly PluginDock[] = ['left', 'right', 'bottom'];

/** apiVersion of the studio kind. Other kinds version themselves. */
export const STUDIO_API_VERSION = 2;

/** Checks the studio specific fields of a module whose id, name and kind are already valid. */
export function validateStudioPlugin(p: Record<string, unknown>): StudioPlugin {
  if (p.apiVersion !== STUDIO_API_VERSION) {
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, this studio supports ${STUDIO_API_VERSION}.`);
  }

  if (!PLUGIN_DOCKS.includes(p.dock as PluginDock)) throw new Error('"dock" must be "left", "right" or "bottom".');

  if (p.hosts !== undefined) {
    const h = p.hosts;
    if (
      !Array.isArray(h) ||
      !h.length ||
      !h.every((x) => PLUGIN_HOSTS.includes(x as PluginHost)) ||
      new Set(h).size !== h.length
    ) {
      throw new Error('"hosts" must be a non-empty list of "studio" or "plan", each at most once.');
    }
  }

  if (typeof p.mount !== 'function') throw new Error('"mount" must be a function.');

  if (p.drawExport !== undefined && typeof p.drawExport !== 'function') {
    throw new Error('"drawExport" must be a function when present.');
  }

  return p as unknown as StudioPlugin;
}
