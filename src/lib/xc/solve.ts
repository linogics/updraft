import './nodeGlobal';

import { solver } from 'igc-xc-score';

import type { LeagueRule } from '#lib/plugins/api';

import type { Fix } from '../domain/model';
import { mapResult } from './mapResult';
import { toSolverRules } from './rules';
import type { XcScore } from './types';

/** Time the solver may spend. Its best result so far is used when the budget runs out. */
const BUDGET_MS = 10_000;
/** Longer tracks are thinned, the scoring search grows steeply with the fix count. */
const MAX_FIXES = 5000;

/** The track in the shape the solver reads. */
export function toSolverFlight(fixes: Fix[]) {
  const stride = Math.ceil(fixes.length / MAX_FIXES);
  return {
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
}

/** Scores a track with the league rules. Null when nothing scored, throws on solver errors. */
export function solveFlight(
  fixes: Fix[],
  league: string,
  rules: readonly LeagueRule[],
  budgetMs = BUDGET_MS
): XcScore | null {
  const best = solver(toSolverFlight(fixes) as never, toSolverRules(rules), { maxcycle: budgetMs }).next().value;
  return best ? mapResult(league, best) : null;
}
