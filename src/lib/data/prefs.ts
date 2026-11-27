import type { PrefsEvent, PrefsService, Units } from '#lib/plugins/api';
import { prefsSchema } from '#lib/plugins/coreSchemas';
import { eventsOf } from '#lib/plugins/events.svelte';
import { services } from '#lib/plugins/services';
import { parseAltRef } from '#lib/state/altRefPrefs';
import { altRefPrefs } from '#lib/state/altRefPrefs.svelte';
import { thermalPrefs } from '#lib/state/thermalPrefs.svelte';
import { unitPrefs } from '#lib/state/units.svelte';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';
import { parseUnits } from '#lib/ui/units';
import { leagueOf } from '#lib/xc/leagues';

export type { PrefsService };

export const PREFS_SERVICE = 'updraft/prefs@1';

/** Provides `updraft/prefs@1` on top of the reactive preference state. Returns the unregister function. */
export function providePrefsService() {
  return services.provide(
    PREFS_SERVICE,
    (): PrefsService => {
      let unitsSrc: Units | undefined;
      let units: Readonly<Units>;

      const on = eventsOf<PrefsEvent>(PREFS_SERVICE, {
        units: () => void unitPrefs.units,
        altRef: () => void altRefPrefs.ref,
        league: () => void xcPrefs.league,
        thermals: () => void [thermalPrefs.columns, thermalPrefs.labels]
      });

      return Object.freeze<PrefsService>({
        on,
        units() {
          if (unitsSrc !== unitPrefs.units) {
            unitsSrc = unitPrefs.units;
            units = Object.freeze({ ...unitsSrc });
          }

          return units;
        },
        setUnits(next) {
          const clean = parseUnits(next);
          if ((Object.keys(clean) as (keyof Units)[]).some((k) => clean[k] !== next?.[k])) {
            throw new Error('Invalid units.');
          }

          unitPrefs.set(clean);
        },
        altRef: () => altRefPrefs.ref,
        setAltRef(ref) {
          if (parseAltRef(ref) !== ref) throw new Error('Invalid altitude reference.');
          altRefPrefs.set(ref);
        },
        league: () => xcPrefs.league,
        setLeague(id) {
          const league = leagueOf(id);
          if (!league) throw new Error(`Unknown league "${id}".`);
          if (league.id !== xcPrefs.league) xcPrefs.set(league.id);
        },
        thermalColumns: () => thermalPrefs.columns,
        thermalLabels: () => thermalPrefs.labels,
        setThermals({ columns = thermalPrefs.columns, labels = thermalPrefs.labels }) {
          if (typeof columns !== 'boolean' || typeof labels !== 'boolean') {
            throw new Error('Thermal switches must be true or false.');
          }

          thermalPrefs.set({ columns, labels });
        }
      });
    },
    'updraft',
    prefsSchema
  );
}
