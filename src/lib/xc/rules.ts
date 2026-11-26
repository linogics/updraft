import { scoringRules } from 'igc-xc-score';

import type { LeagueRule } from '#lib/plugins/api';

type Rule = Record<string, unknown>;

// The library keeps its bound, score, closing and post functions private, so they are taken
// from the rule sets it ships. League data never carries code, only numbers pick these.
const lib = scoringRules as Record<string, Rule[]>;
const FREE = lib.XContest[0];
const TRIANGLE = lib.XContest[1];
const OAR = lib['FAI-OAR'][0];
const OAR2 = lib['FAI-OAR2'][0];
const CYLINDERS = lib['FAI-Cylinders'][0];

const round2 = (v: number) => parseFloat(parseFloat(String(v)).toFixed(2));
const round1 = (v: number) => parseFloat(parseFloat(String(v)).toFixed(1));

const CODES = { free: 'od', flat: 'tri', fai: 'fai', oar: 'oar', oar2: 'oar' } as const;
const BASE = { free: FREE, flat: TRIANGLE, fai: TRIANGLE, oar: OAR, oar2: OAR2 } as const;

/** Turns declarative league rules into the rule objects of igc-xc-score. */
export function toSolverRules(rules: readonly LeagueRule[]): Rule[] {
  return rules.map((r) => {
    const base = BASE[r.type];
    const out: Rule = {
      name: r.name,
      multiplier: r.multiplier,
      bound: base.bound,
      score: base.score,
      rounding: round2,
      cardinality: r.type === 'oar2' ? 2 : 3,
      code: CODES[r.type]
    };
    if (r.type !== 'free') out.closingDistance = base.closingDistance;
    const minSide = r.minSide ?? (r.type === 'fai' ? 0.28 : undefined);
    if (minSide !== undefined) out.minSide = minSide;
    if (r.maxSide !== undefined) out.maxSide = r.maxSide;
    if (r.minDistance !== undefined) out.minDistance = r.minDistance;
    if (r.closing?.fixed !== undefined) out.closingDistanceFixed = r.closing.fixed;
    if (r.closing?.free !== undefined) out.closingDistanceFree = r.closing.free;
    if (r.closing?.relative !== undefined) out.closingDistanceRelative = r.closing.relative;
    if (r.decimals === 1) out.finalRounding = round1;

    if (r.cylinders) {
      out.cylinders = r.cylinders;
      out.post = CYLINDERS.post;
    }

    return out;
  });
}
