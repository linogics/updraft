import { RESERVED_NAMESPACE, services } from '#lib/plugins/services';
import type { StudioState, NeedKind } from '#lib/state/studio.svelte';
import { unitPrefs } from '#lib/state/units.svelte';

/** `updraft/*-state@major` hands out app state objects, for bundled plugins only. */
const INTERNAL_SERVICE = /^updraft\/[a-z0-9-]+-state@\d+$/;

/** What a version 2 studio plugin gets. Data comes from services, see `updraft/studio@1`. */
export interface PluginContext {
  /** A service named in the plugin's `requires`. Throws for any other name. */
  use<T = unknown>(name: string): T;
  /** A div over the 3D and 2D views, owned by the plugin. Clicks pass through unless it sets pointer-events. */
  overlay: HTMLDivElement;
  /** Calls `fn` after time, flights, selection or units changed, at most once per animation frame. */
  subscribe(fn: () => void): () => void;
  /** Asks the studio to run background work for as long as the plugin is mounted. */
  need(kind: NeedKind): () => void;
}

/**
 * Builds the context of one mounted plugin. `dispose` removes the overlay, stops every subscription and
 * releases every need. A subscriber that throws is reported to `onError`, the others keep running.
 */
export function createPluginContext(
  studio: StudioState,
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
        studio.viewsEl?.append(overlay);
      }

      return overlay;
    },
    subscribe(fn) {
      let frame = 0;
      let first = true;
      const stopRoot = $effect.root(() => {
        $effect(() => {
          // Reading these is what makes the effect run again.
          void [studio.time, studio.flights, studio.selected, unitPrefs.units];
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
      return keep(studio.need(kind));
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
