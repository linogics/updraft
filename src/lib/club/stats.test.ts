import { describe, expect, it } from 'vitest';
import { chain, circle, straight } from '../domain/testing/tracks';
import type { Flight } from '../domain/model';
import { isClubStats } from '../storage/validate';
import type { XcScore } from '../xc/types';
import { computeClubStats } from './stats';

const fixes = chain(
  (f) => straight(f, { headingDeg: 90, speed: 10, climb: -1, duration: 120 }),
  (f) => circle(f, { radius: 40, period: 25, climb: 2, duration: 150 }),
  (f) => straight(f, { headingDeg: 90, speed: 10, climb: -1, duration: 120 })
);
const flight: Flight = {
  id: 'f',
  sourceName: 'x.igc',
  pilot: 'Pia',
  glider: 'G',
  site: 'Hill',
  date: '2026-07-15',
  fixes
};

const score = (turnpoints: XcScore['turnpoints']): XcScore => ({
  league: 'XContest',
  type: 'free',
  distance: 3000,
  multiplier: 1,
  points: 3,
  turnpoints
});
const at = (i: number) => ({ lat: fixes[i].lat, lon: fixes[i].lon });

describe('computeClubStats', () => {
  it('reads the figures from the analysis', async () => {
    const s = await computeClubStats(flight, { league: 'XContest', xc: null });

    expect(isClubStats(s)).toBe(true);
    expect(s).toMatchObject({ pilot: 'Pia', site: 'Hill', glider: 'G', durationS: 390 });
    expect(s.bestClimb).toBeGreaterThan(1.5);
    expect(s.bestThermalGain).toBeGreaterThan(250);
    expect(s.maxGain).toBe(Math.max(...fixes.map((f) => f.alt)) - fixes[0].alt);
    expect(s.maxAgl).toBeUndefined();
    expect(s.xc).toBeUndefined();
  });

  it('uses the furthest point from takeoff without a score and the scored distance when larger', async () => {
    const plain = await computeClubStats(flight, { league: 'XContest', xc: null });
    const scored = await computeClubStats(flight, { league: 'XContest', xc: score([at(0), at(fixes.length - 1)]) });

    expect(plain.freeDistanceKm).toBeGreaterThan(2);
    expect(plain.freeDistanceKm).toBeLessThan(3);
    expect(scored.freeDistanceKm).toBe(3);
  });

  it('adds the XC result with a speed from the route times', async () => {
    const s = await computeClubStats(flight, { league: 'XContest', xc: score([at(0), at(fixes.length - 1)]) });

    expect(s.xc).toEqual({ league: 'XContest', points: 3, distanceKm: 3, kind: 'free', speedKmh: 3 / (390 / 3600) });
  });

  it('gives a closed route no speed', async () => {
    const s = await computeClubStats(flight, { league: 'XContest', xc: score([at(0), at(100), at(0)]) });

    expect(s.xc?.speedKmh).toBeUndefined();
  });

  it('measures AGL against the ground series', async () => {
    const ground = fixes.map((f) => f.alt - 700);
    const s = await computeClubStats(flight, { league: 'XContest', xc: null, ground });

    expect(s.maxAgl).toBe(700);
    expect((await computeClubStats(flight, { league: 'XContest', xc: null, ground: [1] })).maxAgl).toBeUndefined();
  });
});

describe('isClubStats', () => {
  const ok = {
    v: 1,
    pilot: 'P',
    date: '2026-01-01',
    site: null,
    glider: null,
    durationS: 1,
    freeDistanceKm: 1,
    maxAltMsl: 1,
    maxGain: 1,
    bestClimb: 1,
    bestThermalGain: 1
  };

  it('accepts a valid summary and rejects bad ones', () => {
    expect(isClubStats(ok)).toBe(true);
    expect(isClubStats({ ...ok, xc: { league: 'FAI', points: 1, distanceKm: 1, kind: 'fai', speedKmh: 20 } })).toBe(
      true
    );
    expect(isClubStats({ ...ok, v: 2 })).toBe(false);
    expect(isClubStats({ ...ok, maxGain: Infinity })).toBe(false);
    expect(isClubStats({ ...ok, durationS: '5' })).toBe(false);
    expect(isClubStats({ ...ok, maxAgl: NaN })).toBe(false);
    expect(isClubStats({ ...ok, xc: { league: 'FAI' } })).toBe(false);
    expect(isClubStats(null)).toBe(false);
  });
});
