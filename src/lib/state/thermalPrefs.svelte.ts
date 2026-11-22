import { parseThermalPrefs, type ThermalPrefsValue } from './thermalPrefs';

const KEY = 'thermalPrefs';

// Storage can throw (private mode, blocked site data). Prefs then just reset to shown.
function load(): ThermalPrefsValue {
  try {
    return parseThermalPrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parseThermalPrefs(null);
  }
}

const initial = typeof localStorage === 'undefined' ? parseThermalPrefs(null) : load();

/** Thermal column and label toggles, kept in this browser (not in the shareable scene URL). */
class ThermalPrefs {
  columns = $state(initial.columns);
  labels = $state(initial.labels);

  set(prefs: ThermalPrefsValue) {
    this.columns = prefs.columns;
    this.labels = prefs.labels;
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Not persisted, the choice still applies for this session.
    }
  }
}

export const thermalPrefs = new ThermalPrefs();
