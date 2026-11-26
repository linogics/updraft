import { DEFAULT_LEAGUE, leagueOf } from '#lib/xc/leagues';

const KEY = 'xcLeague';

// Storage can throw (private mode, blocked site data). The league then resets to XContest.
function load(): string {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return typeof v === 'string' ? v : DEFAULT_LEAGUE;
  } catch {
    return DEFAULT_LEAGUE;
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
  // The stored id may belong to a removed plugin, so it is only read through `league`.
  private chosen = $state(typeof localStorage === 'undefined' ? DEFAULT_LEAGUE : load());

  /** The league in use, XContest when the chosen one is not known any more. */
  get league(): string {
    return leagueOf(this.chosen) ? this.chosen : DEFAULT_LEAGUE;
  }

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

  set(league: string) {
    this.chosen = league;
    try {
      localStorage.setItem(KEY, JSON.stringify(league));
    } catch {
      // Not persisted, the choice still applies for this session.
    }
  }
}

export const xcPrefs = new XcPrefs();
