import { describe, expect, it } from 'vitest';

import type { ValidClubEntry } from './index';
import { rankings } from './rankings';
import type { ClubStats } from './stats';

let n = 0;
const entry = (owner: string, over: Partial<ClubStats> = {}): ValidClubEntry => ({
  key: `k${++n}`,
  owner,
  mine: false,
  stats: {
    v: 1,
    pilot: owner.toUpperCase(),
    date: '2026-07-01',
    site: null,
    glider: null,
    durationS: 100,
    freeDistanceKm: 1,
    maxAltMsl: 1000,
    maxGain: 100,
    bestClimb: 1,
    bestThermalGain: 50,
    ...over
  }
});
const xc = (league: string, points: number, speedKmh?: number) => ({
  league,
  points,
  distanceKm: 10,
  kind: 'free',
  speedKmh
});

describe('rankings', () => {
  it('orders the top three with medals and leaves the rest out', () => {
    const list = ['a', 'b', 'c', 'd'].map((o, i) => entry(o, { freeDistanceKm: 10 - i }));

    const rows = rankings(list, 'XContest').freeDistance;

    expect(rows.map((r) => [r.owner, r.medal, r.value])).toEqual([
      ['a', 'gold', 10],
      ['b', 'silver', 9],
      ['c', 'bronze', 8]
    ]);
    expect(rows[0].entryKey).toBe(list[0].key);
  });

  it('shares a medal on a tie and skips the tied places, older flight first', () => {
    const list = [
      entry('a', { maxAltMsl: 3000, date: '2026-07-03' }),
      entry('b', { maxAltMsl: 3000, date: '2026-07-02' }),
      entry('c', { maxAltMsl: 2000 }),
      entry('d', { maxAltMsl: 1500 })
    ];

    expect(rankings(list, 'XContest').maxAltMsl.map((r) => [r.owner, r.medal])).toEqual([
      ['b', 'gold'],
      ['a', 'gold'],
      ['c', 'bronze']
    ]);
  });

  it('counts only entries of the chosen league for XC points', () => {
    const list = [
      entry('a', { xc: xc('FAI', 99) }),
      entry('b', { xc: xc('XContest', 20) }),
      entry('c', { xc: xc('XContest', 30) }),
      entry('d')
    ];

    const rows = rankings(list, 'XContest').xcPoints;

    expect(rows.map((r) => [r.owner, r.value])).toEqual([
      ['c', 30],
      ['b', 20]
    ]);
    expect(rankings(list, 'FAI').xcPoints.map((r) => r.owner)).toEqual(['a']);
  });

  it('shows each pilot once with their best flight', () => {
    const list = [entry('a', { bestClimb: 3 }), entry('a', { bestClimb: 5 }), entry('b', { bestClimb: 4 })];

    const rows = rankings(list, 'XContest').bestClimb;

    expect(rows.map((r) => [r.owner, r.value, r.medal])).toEqual([
      ['a', 5, 'gold'],
      ['b', 4, 'silver']
    ]);
    expect(rows[0].entryKey).toBe(list[1].key);
  });

  it('sums airtime and counts flights per pilot, named after the latest flight', () => {
    const list = [
      entry('a', { durationS: 100, pilot: 'Old', date: '2026-01-01' }),
      entry('a', { durationS: 200, pilot: 'New', date: '2026-06-01' }),
      entry('b', { durationS: 250 }),
      entry('b', { durationS: 10 }),
      entry('b', { durationS: 10 })
    ];

    const r = rankings(list, 'XContest');

    expect(r.totalAirtime.map((x) => [x.pilot, x.value, x.entryKey])).toEqual([
      ['New', 300, undefined],
      ['B', 270, undefined]
    ]);
    expect(r.mostFlights.map((x) => [x.owner, x.value])).toEqual([
      ['b', 3],
      ['a', 2]
    ]);
    expect(r.longestFlight[0]).toMatchObject({ owner: 'b', value: 250 });
  });

  it('skips missing values such as AGL and speed', () => {
    const r = rankings([entry('a'), entry('b', { maxAgl: 500, xc: xc('XContest', 5, 30) })], 'XContest');

    expect(r.maxAgl.map((x) => x.owner)).toEqual(['b']);
    expect(r.xcSpeed.map((x) => x.value)).toEqual([30]);
    expect(rankings([], 'XContest').xcPoints).toEqual([]);
  });
});
