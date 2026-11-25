import { SvelteSet } from 'svelte/reactivity';
import { studioLayout } from '#lib/state/studioLayout.svelte';
import { pluginPanelId } from './registry.svelte';
import type { Plugin } from './plugins';

/** Plugins whose panel is mounted right now. Hidden plugins are not loaded and do not take part in exports. */
export const mountedPlugins = new SvelteSet<Plugin>();

/**
 * Mounted plugins that can draw into exports, in layout order (left, right, bottom dock, then position in the dock).
 * Reactive, so a dialog can list them.
 */
export function exportPlugins(): Plugin[] {
  const { docks } = studioLayout.value;
  const order = [...docks.left, ...docks.right, ...docks.bottom];
  const rank = (p: Plugin) => order.indexOf(pluginPanelId(p.id));
  return [...mountedPlugins].filter((p) => p.drawExport).sort((a, b) => rank(a) - rank(b));
}

/**
 * Paints each plugin onto `ctx`, in order. The frame size is `ctx.canvas.width` by `ctx.canvas.height`.
 * `time` is the studio playback time in ms, the same clock as `ctx.time()` in the plugin context.
 * `drawExport` must be synchronous, a returned promise is ignored.
 * A plugin that throws is reported once to `onError` and skipped for the rest of the export, so pass the same
 * `failed` set for every frame of one export. The context state is restored either way.
 */
export function paintPlugins(
  ctx: CanvasRenderingContext2D,
  plugins: readonly Plugin[],
  time: number,
  failed: Set<string>,
  onError: (plugin: Plugin, err: unknown) => void
) {
  for (const plugin of plugins) {
    if (!plugin.drawExport || failed.has(plugin.id)) continue;
    ctx.save();
    try {
      plugin.drawExport(ctx, time);
    } catch (err) {
      failed.add(plugin.id);
      console.error(`Plugin "${plugin.id}": drawExport failed`, err);
      onError(plugin, err);
    } finally {
      ctx.restore();
    }
  }
}
