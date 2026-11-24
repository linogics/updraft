import type { Viewer } from 'cesium';
import type { StudioState, NeedKind } from '#lib/state/studio.svelte';
import { unitPrefs } from '#lib/state/units.svelte';
import type { Units } from '#lib/ui/units';

export interface PluginFlight {
  id: string;
  pilot: string;
  glider: string | null;
  color: string;
  visible: boolean;
  /** Fixes on the studio clock, as the studio shows them. Do not modify. */
  fixes: { t: number; lat: number; lon: number; alt: number }[];
}

/** What a version 1 plugin can use. Everything is read through functions, so it is always current. */
export interface PluginContext {
  flights(): PluginFlight[];
  time(): number;
  selectedId(): string | null;
  units(): Units;
  seek(ms: number): void;
  select(id: string): void;
  /** The Cesium viewer, null while the 3D view is not shown. */
  viewer(): Viewer | null;
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
export function createPluginContext(studio: StudioState, onError: (err: unknown) => void) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;z-index:10;overflow:hidden;pointer-events:none';
  studio.viewsEl?.append(overlay);

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
    flights: () =>
      studio.flights.map((lf) => ({
        id: lf.flight.id,
        pilot: lf.flight.pilot,
        glider: lf.flight.glider,
        color: lf.color,
        visible: lf.visible,
        fixes: lf.flight.fixes
      })),
    time: () => studio.time,
    selectedId: () => studio.selected?.flight.id ?? null,
    units: () => ({ ...unitPrefs.units }),
    seek: (ms) => studio.seek(Number(ms)),
    select(id) {
      if (studio.flights.some((lf) => lf.flight.id === id)) studio.selectedId = id;
    },
    viewer: () => (studio.viewer && !studio.viewer.isDestroyed() ? studio.viewer : null),
    overlay,
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
      overlay.remove();
    }
  };
}
