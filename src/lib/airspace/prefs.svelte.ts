import { loadOpenAipKey, saveOpenAipKey } from '#lib/config';
import { parseAirspacePrefs, type AirspacePrefsValue } from './prefs';

const KEY = 'airspacePrefs';

// Storage can throw (private mode, blocked site data). Prefs then just reset to the defaults.
function load(): AirspacePrefsValue {
  try {
    return parseAirspacePrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parseAirspacePrefs(null);
  }
}

const initial = typeof localStorage === 'undefined' ? parseAirspacePrefs(null) : load();

/** Airspace layer prefs and the openAIP key, kept in this browser (not in the shareable URL). */
class AirspacePrefs {
  show = $state(initial.show);
  classes = $state(initial.classes);
  maxFloor = $state(initial.maxFloor);
  opacity = $state(initial.opacity);
  key = $state(loadOpenAipKey());

  set(patch: Partial<AirspacePrefsValue>) {
    Object.assign(this, patch);
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({ show: this.show, classes: this.classes, maxFloor: this.maxFloor, opacity: this.opacity })
      );
    } catch {
      // Not persisted, the choice still applies for this session.
    }
  }

  setKey(key: string) {
    this.key = key;
    saveOpenAipKey(key);
  }
}

export const airspacePrefs = new AirspacePrefs();
