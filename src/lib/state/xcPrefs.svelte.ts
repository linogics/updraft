import { parseXcLeague, type XcLeague } from './xcPrefs';

const KEY = 'xcLeague';

// Storage can throw (private mode, blocked site data). The league then resets to XContest.
function load(): XcLeague {
  try {
    return parseXcLeague(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parseXcLeague(null);
  }
}

const ENABLED_KEY = 'xcEnabled';

function loadEnabled(): boolean {
  try {
    return JSON.parse(localStorage.getItem(ENABLED_KEY) ?? 'false') === true;
  } catch {
    return false;
  }
}

/** League used for XC scoring, kept in this browser. */
class XcPrefs {
  league = $state<XcLeague>(typeof localStorage === 'undefined' ? parseXcLeague(null) : load());

  /** Master switch for XC scoring, off on a fresh start. */
  enabled = $state(typeof localStorage === 'undefined' ? false : loadEnabled());

  setEnabled(on: boolean) {
    this.enabled = on;
    try {
      localStorage.setItem(ENABLED_KEY, JSON.stringify(on));
    } catch {
      // Not persisted, the choice still applies for this session.
    }
  }

  set(league: XcLeague) {
    this.league = league;
    try {
      localStorage.setItem(KEY, JSON.stringify(league));
    } catch {
      // Not persisted, the choice still applies for this session.
    }
  }
}

export const xcPrefs = new XcPrefs();
