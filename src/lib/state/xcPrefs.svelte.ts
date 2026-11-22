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

/** League used for XC scoring, kept in this browser. */
class XcPrefs {
  league = $state<XcLeague>(typeof localStorage === 'undefined' ? parseXcLeague(null) : load());

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
