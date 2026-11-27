import { describe, expect, it } from 'vitest';

import type { ClubStats } from '#lib/club/stats';
import type { BadgeDef, BadgeFlight } from '#lib/plugins/badgeKind';

import { badgeProgress, toBadgeFlight } from './progress';

const flight = (maxGain: number): BadgeFlight => ({
  date: '',
  site: null,
  glider: null,
  durationS: 0,
  freeDistance: 0,
  maxAltMsl: 0,
  maxGain,
  bestClimb: 0,
  bestThermalGain: 0
});
const def = (value: BadgeDef['value']): BadgeDef => ({
  id: 'x',
  label: 'X',
  unit: 'altitude',
  thresholds: [10, 20, 30, 40, 50, 60, 70, 80],
  value
});
const best: BadgeDef['value'] = (l) => Math.max(0, ...l.map((x) => x.maxGain));
const item = (date: string, gain: number) => ({ flight: flight(gain), date, ref: `${date}:${gain}` });

describe('badgeProgress', () => {
  it('has no tier without flights', () => {
    expect(badgeProgress(def(best), [])).toEqual({
      value: 0,
      tier: null,
      next: 10,
      ratio: 0,
      ref: null,
      unlocked: Array(8).fill(null)
    });
  });

  it('sorts by date and finds unlock dates and the ref', () => {
    const p = badgeProgress(def(best), [item('2026-03-01', 45), item('2026-01-01', 12), item('2026-02-01', 5)]);
    expect(p.value).toBe(45);
    expect(p.tier).toBe('platinum');
    expect(p.next).toBe(50);
    expect(p.ratio).toBeCloseTo(0.5);
    expect(p.ref).toBe('2026-03-01:45');
    expect(p.unlocked).toEqual(['2026-01-01', '2026-03-01', '2026-03-01', '2026-03-01', null, null, null, null]);
  });

  it('reports Legend with a full ratio', () => {
    const p = badgeProgress(def(best), [item('2026-01-01', 100)]);
    expect(p).toMatchObject({ tier: 'legend', next: null, ratio: 1 });
  });

  it('counts a throwing or invalid value as 0', () => {
    for (const bad of [
      () => 1 / 0,
      () => -3,
      () => NaN,
      () => {
        throw new Error('x');
      }
    ]) {
      expect(badgeProgress(def(bad), [item('2026-01-01', 99)])).toMatchObject({ value: 0, tier: null, ref: null });
    }
  });

  it('stays fast on many flights', () => {
    const items = Array.from({ length: 2000 }, (_, i) => item(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, i));
    expect(badgeProgress(def(best), items).value).toBe(1999);
  });
});

describe('toBadgeFlight', () => {
  it('converts km and km/h to metres and m/s', () => {
    const s = {
      v: 1,
      pilot: 'p',
      date: '2026-01-01',
      site: 'S',
      glider: null,
      durationS: 60,
      freeDistanceKm: 12.5,
      maxAltMsl: 1,
      maxGain: 2,
      bestClimb: 3,
      bestThermalGain: 4,
      xc: { league: 'l', points: 1, distanceKm: 3, kind: 'fai', speedKmh: 36 }
    } satisfies ClubStats;
    expect(toBadgeFlight(s)).toMatchObject({ freeDistance: 12_500, xc: { kind: 'fai', distance: 3000, speed: 10 } });
  });
});
