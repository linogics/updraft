import './nodeGlobal';
import { scoringRules, solver } from 'igc-xc-score';
import type { Fix } from '../domain/model';
import type { XcLeague } from '../state/xcPrefs';
import { mapResult } from './mapResult';

/** Time the solver may spend. Its best result so far is used when the budget runs out. */
const BUDGET_MS = 10_000;
/** Longer tracks are thinned, the scoring search grows steeply with the fix count. */
const MAX_FIXES = 5000;

self.onmessage = (e: MessageEvent<{ fixes: Fix[]; league: XcLeague }>) => {
  const { fixes, league } = e.data;
  const stride = Math.ceil(fixes.length / MAX_FIXES);
  const flight = {
    fixes: fixes
      .filter((_, i) => i % stride === 0 || i === fixes.length - 1)
      .map((f) => ({
        timestamp: f.t,
        latitude: f.lat,
        longitude: f.lon,
        valid: true,
        pressureAltitude: f.alt,
        gpsAltitude: f.alt
      }))
  };
  try {
    const best = solver(flight as never, (scoringRules as Record<string, object>)[league], {
      maxcycle: BUDGET_MS
    }).next().value;
    self.postMessage({ score: best ? mapResult(league, best as never) : null });
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
