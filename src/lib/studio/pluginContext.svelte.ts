import { RESERVED_NAMESPACE, services } from '#lib/plugins/services';
import type { PluginContext } from '#lib/plugins/api';
import type { StudioState } from '#lib/state/studio.svelte';
import { unitPrefs } from '#lib/state/units.svelte';

export type { PluginContext };

/** `updraft/*-state@major` hands out app state objects, for bundled plugins only. */
const INTERNAL_SERVICE = /^updraft\/[a-z0-9-]+-state@\d+$/;

/** What a page offers a plugin. The studio and the planner each have one, see `studioHost`. */
export interface PluginHostEnv {
  /** The element the overlay is added to. */
  overlayParent(): HTMLElement | null | undefined;
  /** Reads the reactive values whose change fires subscribers. */
  watch(): void;
  /** Absent where there is no background work to ask for, `ctx.need` then throws. */
  need?: StudioState['need'];
}

export const studioHost = (studio: StudioState): PluginHostEnv => ({
  overlayParent: () => studio.viewsEl,
  watch: () => void [studio.time, studio.flights, studio.selected, unitPrefs.units],
  need: (kind) => studio.need(kind)
});

/**
 * Builds the context of one mounted plugin. `dispose` removes the overlay, stops every subscription and
 * releases every need. A subscriber that throws is reported to `onError`, the others keep running.
 */
export function createPluginContext(
  host: PluginHostEnv,
  pluginId: string,
  requires: readonly string[],
  onError: (err: unknown) => void
) {
  // Created on first access, most plugins never draw over the views.
  let overlay: HTMLDivElement | undefined;

  // Plain bookkeeping, nothing renders from it.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const stops = new Set<() => void>();
  const keep = (stop: () => void) => {
    const once = () => {
      if (stops.delete(once)) stop();
    };

    stops.add(once);
    return once;
  };

  const ctx: PluginContext = {
    use<T>(name: string) {
      if (!requires.includes(name)) throw new Error(`Service "${name}" is not in requires.`);
      if (INTERNAL_SERVICE.test(name) && !pluginId.startsWith(RESERVED_NAMESPACE))
        throw new Error(`Service "${name}" is internal to bundled plugins.`);
      return services.use<T>(name);
    },
    get overlay() {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;inset:0;z-index:10;overflow:hidden;pointer-events:none';
        host.overlayParent()?.append(overlay);
      }

      return overlay;
    },
    subscribe(fn) {
      let frame = 0;
      let first = true;
      const stopRoot = $effect.root(() => {
        $effect(() => {
          // Reading these is what makes the effect run again.
          host.watch();
          if (first) {
            first = false;
            return;
          }

          if (frame) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            try {
              fn();
            } catch (err) {
              onError(err);
            }
          });
        });
      });

      return keep(() => {
        stopRoot();
        cancelAnimationFrame(frame);
      });
    },
    need(kind) {
      if (kind !== 'xc' && kind !== 'ground') throw new Error(`Unknown need "${String(kind)}".`);
      if (!host.need) throw new Error('need is not available in the planner.');
      return keep(host.need(kind));
    }
  };

  return {
    ctx: Object.freeze(ctx),
    dispose() {
      for (const stop of [...stops]) stop();
      overlay?.remove();
    }
  };
}
