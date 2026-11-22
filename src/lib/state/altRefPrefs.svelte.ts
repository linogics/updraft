import { parseAltRef, type AltRef } from './altRefPrefs';

const KEY = 'altRef';

// Storage can throw (private mode, blocked site data). The pref then resets to MSL.
function load(): AltRef {
  try {
    return parseAltRef(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return 'msl';
  }
}

/** Altitude reference of transition altitudes and the chart, kept in this browser (not in the scene URL). */
class AltRefPrefs {
  ref = $state<AltRef>(typeof localStorage === 'undefined' ? 'msl' : load());

  set(ref: AltRef) {
    this.ref = ref;
    try {
      localStorage.setItem(KEY, JSON.stringify(ref));
    } catch {
      // Not persisted, the choice still applies for this session.
    }
  }
}

export const altRefPrefs = new AltRefPrefs();
