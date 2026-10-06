import { parseUnits, type Units } from '#lib/ui/units';

const KEY = 'units';

// Storage can throw (private mode, blocked site data); units then just reset to metric.
function load(): Units {
  try {
    return parseUnits(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parseUnits(null);
  }
}

/** Personal display units, kept in this browser (not in the shareable scene URL). */
class UnitPrefs {
  units = $state<Units>(typeof localStorage === 'undefined' ? parseUnits(null) : load());

  set(units: Units) {
    this.units = units;
    try {
      localStorage.setItem(KEY, JSON.stringify(units));
    } catch {
      // Not persisted; the choice still applies for this session.
    }
  }
}

export const unitPrefs = new UnitPrefs();
