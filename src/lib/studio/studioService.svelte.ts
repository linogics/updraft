import type { Viewer } from 'cesium';
import { services } from '#lib/plugins/services';
import type { StudioState } from '#lib/state/studio.svelte';
import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
import type { AltRef } from '#lib/state/altRefPrefs';
import { unitPrefs } from '#lib/state/units.svelte';
import type { Units } from '#lib/ui/units';

export const STUDIO_SERVICE = 'updraft/studio@1';

export interface PluginFlight {
  readonly id: string;
  readonly pilot: string;
  readonly glider: string | null;
  readonly color: string;
  readonly visible: boolean;
  /** Fixes on the studio clock, as the studio shows them. Shared with the studio, do not modify. */
  readonly fixes: readonly { t: number; lat: number; lon: number; alt: number }[];
}

/** `updraft/studio@1`. Everything is read through functions, so it is always current. */
export interface StudioService {
  /** The same frozen array until flights, colors or visibility change. */
  flights(): readonly PluginFlight[];
  /** Studio playback time in ms. */
  time(): number;
  selectedId(): string | null;
  /** The same frozen object until the user changes units. */
  units(): Readonly<Units>;
  /** The altitude reference the user chose. */
  altRef(): AltRef;
  seek(ms: number): void;
  select(id: string): void;
  /** The Cesium viewer, null while the 3D view is not shown. */
  viewer(): Viewer | null;
}

type Host = Pick<StudioState, 'flights' | 'time' | 'selected' | 'selectedId' | 'viewer' | 'seek'>;

/** Provides `updraft/studio@1` for as long as the studio is open. Returns the unregister function. */
export function provideStudioService(studio: Host) {
  return services.provide(
    STUDIO_SERVICE,
    (): StudioService => {
      // Keyed on the identity of the source arrays, which the studio replaces on every change. Not a $derived,
      // an unowned derived would rebuild on every read outside an effect.
      let src: unknown;
      let flights: readonly PluginFlight[] = [];
      let unitsSrc: Units | undefined;
      let units: Readonly<Units>;

      return Object.freeze<StudioService>({
        flights() {
          if (src !== studio.flights) {
            src = studio.flights;
            flights = Object.freeze(
              studio.flights.map((lf) =>
                Object.freeze({
                  id: lf.flight.id,
                  pilot: lf.flight.pilot,
                  glider: lf.flight.glider,
                  color: lf.color,
                  visible: lf.visible,
                  fixes: lf.flight.fixes
                })
              )
            );
          }

          return flights;
        },
        time: () => studio.time,
        selectedId: () => studio.selected?.flight.id ?? null,
        units() {
          if (unitsSrc !== unitPrefs.units) {
            unitsSrc = unitPrefs.units;
            units = Object.freeze({ ...unitsSrc });
          }

          return units;
        },
        altRef: () => altRefPrefs.ref,
        seek: (ms) => studio.seek(Number(ms)),
        select(id) {
          if (studio.flights.some((lf) => lf.flight.id === id)) studio.selectedId = id;
        },
        viewer: () => (studio.viewer && !studio.viewer.isDestroyed() ? studio.viewer : null)
      });
    },
    'updraft'
  );
}
