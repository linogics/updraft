import type { PluginFlight, StudioEvent, StudioService } from '#lib/plugins/api';
import { eventsOf } from '#lib/plugins/events.svelte';
import { services } from '#lib/plugins/services';
import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
import type { StudioState } from '#lib/state/studio.svelte';
import { unitPrefs } from '#lib/state/units.svelte';
import { XC_LEAGUES } from '#lib/state/xcPrefs';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';
import type { Units } from '#lib/ui/units';

export type { PluginFlight, StudioService };

export const STUDIO_SERVICE = 'updraft/studio@1';

type Host = Pick<
  StudioState,
  | 'flights'
  | 'time'
  | 'selected'
  | 'selectedId'
  | 'viewer'
  | 'seek'
  | 'play'
  | 'pause'
  | 'playing'
  | 'exportIn'
  | 'exportOut'
  | 'start'
  | 'end'
  | 'setVisible'
  | 'setLeague'
>;

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
      let range: Readonly<{ start: number; end: number }> = Object.freeze({ start: 0, end: 0 });

      const leagues = Object.freeze(XC_LEAGUES.map((l) => Object.freeze({ id: l.id, label: l.label })));

      const on = eventsOf<StudioEvent>(STUDIO_SERVICE, {
        time: () => void studio.time,
        flights: () => void studio.flights,
        selection: () => void studio.selected,
        units: () => void unitPrefs.units,
        altRef: () => void altRefPrefs.ref,
        league: () => void xcPrefs.league,
        playing: () => void studio.playing,
        range: () => void [studio.exportIn ?? studio.start, studio.exportOut ?? studio.end]
      });

      return Object.freeze<StudioService>({
        on,
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
        setVisible(id, visible) {
          if (typeof visible !== 'boolean') throw new Error('Visible must be true or false.');
          if (studio.flights.some((lf) => lf.flight.id === id)) studio.setVisible(id, visible);
        },
        league: () => xcPrefs.league,
        leagues: () => leagues,
        setLeague(id) {
          const league = XC_LEAGUES.find((l) => l.id === id);
          if (!league) throw new Error(`Unknown league "${id}".`);
          if (league.id !== xcPrefs.league) studio.setLeague(league.id);
        },
        play: () => studio.play(),
        pause: () => studio.pause(),
        playing: () => studio.playing,
        range() {
          const start = studio.exportIn ?? studio.start;
          const end = studio.exportOut ?? studio.end;
          if (range.start !== start || range.end !== end) range = Object.freeze({ start, end });
          return range;
        },
        setRange(start, end) {
          if (
            typeof start !== 'number' ||
            typeof end !== 'number' ||
            !Number.isFinite(start) ||
            !Number.isFinite(end)
          ) {
            throw new Error('Range start and end must be finite numbers.');
          }

          const clamp = (t: number) => Math.min(studio.end, Math.max(studio.start, t));
          const [a, b] = [clamp(start), clamp(end)];
          if (!(a < b)) throw new Error('Range start must be before end.');
          studio.exportIn = a;
          studio.exportOut = b;
        },
        clearRange() {
          studio.exportIn = null;
          studio.exportOut = null;
        },
        viewer: () => (studio.viewer && !studio.viewer.isDestroyed() ? studio.viewer : null)
      });
    },
    'updraft'
  );
}

export const STUDIO_STATE_SERVICE = 'updraft/studio-state@1';

/** Provides the live `StudioState` to bundled plugins. `ctx.use` refuses it for any other plugin. */
export function provideStudioState(studio: StudioState) {
  return services.provide(STUDIO_STATE_SERVICE, () => studio, 'updraft');
}
