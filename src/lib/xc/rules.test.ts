import { scoringRules, solver } from 'igc-xc-score';
import { describe, expect, it } from 'vitest';

import { chain, straight } from '../domain/testing/tracks';
import { BUILTIN_LEAGUES } from './builtinLeagues';
import { mapResult } from './mapResult';
import { toSolverRules } from './rules';
import { solveFlight, toSolverFlight } from './solve';

const lib = scoringRules as Record<string, Record<string, unknown>[]>;

describe('toSolverRules', () => {
  // The library keeps its rounding functions private, so those compare by what they do.
  const SAMPLES = [1.234, 56.789, 0.005, 12.25];
  const plain = (rule: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(rule).map(([k, v]) => [
        k,
        k === 'rounding' || k === 'finalRounding' ? SAMPLES.map((x) => (v as (n: number) => number)(x)) : v
      ])
    );

  it.each(BUILTIN_LEAGUES.map((l) => l.id))('matches the library rules of %s', (id) => {
    const mine = toSolverRules(BUILTIN_LEAGUES.find((l) => l.id === id)!.rules);
    // Functions are compared by identity.
    expect(mine.map(plain)).toStrictEqual(lib[id].map(plain));
  });
});

describe('solveFlight', () => {
  const out = straight(
    { t: Date.UTC(2026, 6, 15, 10), lat: 47.5, lon: 11.1, alt: 1500 },
    { headingDeg: 90, speed: 10, climb: 0, duration: 1500, dt: 10 }
  );
  const oar = chain(
    (f) => straight(f, { headingDeg: 90, speed: 10, climb: 0, duration: 1000, dt: 10 }),
    (f) => straight(f, { headingDeg: 270, speed: 10, climb: 0, duration: 1000, dt: 10 })
  );

  const direct = (fixes: typeof out, id: string) => {
    const best = solver(toSolverFlight(fixes) as never, lib[id], { maxcycle: 5000 }).next().value;
    return best ? mapResult(id, best) : null;
  };

  it.each([
    ['XContest', out],
    ['FAI-OAR', oar]
  ])(
    'scores %s like the library',
    (id, fixes) => {
      const mine = solveFlight(fixes, id, BUILTIN_LEAGUES.find((l) => l.id === id)!.rules, 5000);
      expect(mine).not.toBeNull();
      expect(mine).toEqual(direct(fixes, id));
    },
    // Two solver runs per case, slow machines need more than the default 5 s.
    30_000
  );
});
