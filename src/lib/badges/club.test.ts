import { describe, expect, it } from 'vitest';

import type { ValidClubEntry } from '#lib/club';
import type { ClubStats } from '#lib/club/stats';
import type { BadgeDef } from '#lib/plugins/badgeKind';

import { clubBadges } from './club';

const stats = (pilot: string, date: string, durationS: number): ClubStats => ({
  v: 1,
  pilot,
  date,
  site: null,
  glider: null,
  durationS,
  freeDistanceKm: 0,
  maxAltMsl: 0,
  maxGain: 0,
  bestClimb: 0,
  bestThermalGain: 0
});
const entry = (owner: string, pilot: string, date: string, durationS: number, mine = false): ValidClubEntry => ({
  owner,
  key: `${owner}${date}`,
  mine,
  stats: stats(pilot, date, durationS)
});

const longest: BadgeDef = {
  id: 'longest',
  label: 'Longest',
  unit: 'duration',
  thresholds: [10, 20, 30, 40, 50, 60, 70, 80],
  value: (l) => Math.max(0, ...l.map((f) => f.durationS))
};

describe('clubBadges', () => {
  const rows = clubBadges(
    [
      entry('a', 'Zed', '2026-01-01', 25),
      entry('b', 'Amy', '2026-01-01', 25, true),
      entry('b', 'Amy B', '2026-02-01', 15),
      entry('c', 'Cat', '2026-01-01', 55),
      entry('d', 'Dan', '2026-01-01', 5)
    ],
    [longest]
  );

  it('sorts by score, then name', () => {
    expect(rows.map((r) => r.pilot)).toEqual(['Cat', 'Amy B', 'Zed', 'Dan']);
    expect(rows.map((r) => r.score)).toEqual([5, 2, 2, 0]);
  });

  it('names the pilot after the latest flight and keeps the you marker', () => {
    expect(rows.find((r) => r.owner === 'b')).toMatchObject({ pilot: 'Amy B', mine: true });
  });

  it('leaves out badges without a tier', () => {
    expect(rows.find((r) => r.owner === 'd')?.badges).toEqual([]);
    expect(rows[0]?.badges[0]).toMatchObject({ tier: 'diamond', value: 55 });
  });
});
