import type { PluginContext } from './pluginContext.svelte';

export type PluginDock = 'left' | 'right' | 'bottom';
export const PLUGIN_DOCKS: readonly PluginDock[] = ['left', 'right', 'bottom'];

/** apiVersion of the studio kind. Other kinds version themselves. */
export const STUDIO_API_VERSION = 1;

export interface StudioPlugin {
  id: string;
  name: string;
  kind: 'studio';
  apiVersion: 1;
  dock: PluginDock;
  /** Returns the function that tears the plugin down. */
  mount(el: HTMLElement, ctx: PluginContext): void | (() => void);
  drawExport?(ctx2d: CanvasRenderingContext2D, time: number): void;
}

/** Checks the studio specific fields of a module whose id, name and kind are already valid. */
export function validateStudioPlugin(p: Record<string, unknown>): StudioPlugin {
  if (p.apiVersion !== STUDIO_API_VERSION)
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, this studio supports ${STUDIO_API_VERSION}.`);
  if (!PLUGIN_DOCKS.includes(p.dock as PluginDock)) throw new Error('"dock" must be "left", "right" or "bottom".');
  if (typeof p.mount !== 'function') throw new Error('"mount" must be a function.');
  if (p.drawExport !== undefined && typeof p.drawExport !== 'function')
    throw new Error('"drawExport" must be a function when present.');
  return p as unknown as StudioPlugin;
}
