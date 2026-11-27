import { describe, expect, it, vi } from 'vitest';

import type { ClubStats } from '#lib/club/stats';
import type { Flight } from '#lib/domain/model';
import type { FlightSummary } from '#lib/storage';

import { type BadgeRepo, countsForBadges, localBadgeItems } from './local';

const flight = (id: string, club?: ClubStats): Flight => ({
  id,
  sourceName: `${id}.igc`,
  pilot: 'P',
  glider: null,
  site: null,
  date: '2026-07-15',
  fixes: [
    { t: 0, lat: 47, lon: 11, alt: 1000 },
    { t: 60_000, lat: 47.001, lon: 11, alt: 1100 }
  ],
  ...(club && { club, shared: true })
});

const summary = (id: string, extra: Partial<FlightSummary> = {}): FlightSummary => ({
  id,
  sourceName: `${id}.igc`,
  pilot: 'P',
  glider: 'Edited',
  site: 'New site',
  date: '2026-08-01',
  fixCount: 2,
  startTime: 0,
  endTime: 60_000,
  ...extra
});

const club = (maxAgl?: number): ClubStats => ({
  v: 1,
  pilot: 'P',
  date: '2026-07-15',
  site: null,
  glider: null,
  durationS: 3600,
  freeDistanceKm: 10,
  maxAltMsl: 2000,
  maxGain: 500,
  ...(maxAgl !== undefined && { maxAgl }),
  bestClimb: 2,
  bestThermalGain: 200
});

function fakeRepo(flights: Flight[]) {
  const cache = new Map<string, ClubStats>();
  const repo = {
    get: vi.fn(async (id: string) => flights.find((f) => f.id === id)),
    getXcScore: vi.fn(async () => null),
    getBadgeStats: vi.fn(async (id: string) => cache.get(id)),
    putBadgeStats: vi.fn(async (id: string, _l: string, s: ClubStats) => void cache.set(id, s))
  } satisfies BadgeRepo;
  return { repo, cache };
}

describe('countsForBadges', () => {
  it('skips manual entries and demo flights', () => {
    expect(countsForBadges(summary('a'))).toBe(true);
    expect(countsForBadges(summary('b', { manual: true }))).toBe(false);
    expect(countsForBadges(summary('demo-1'))).toBe(false);
  });
});

describe('localBadgeItems', () => {
  it('computes and caches stats, then reads them from the cache', async () => {
    const { repo, cache } = fakeRepo([flight('a')]);
    const first = await localBadgeItems([summary('a')], 'XContest', { repo });

    expect(first).toHaveLength(1);
    expect(cache.has('a')).toBe(true);
    expect(repo.getXcScore).toHaveBeenCalledOnce();

    await localBadgeItems([summary('a')], 'XContest', { repo });
    expect(repo.get).toHaveBeenCalledOnce();
  });

  it('takes metadata from the summary and uses the ref as flight id', async () => {
    const { repo } = fakeRepo([flight('a')]);
    const [item] = (await localBadgeItems([summary('a')], 'XContest', { repo }))!;

    expect(item.ref).toBe('a');
    expect(item.date).toBe('2026-08-01');
    expect(item.flight).toMatchObject({ date: '2026-08-01', site: 'New site', glider: 'Edited' });
  });

  it('uses the club stats of a shared flight, with ground heights', async () => {
    const { repo, cache } = fakeRepo([flight('a', club(900))]);
    cache.set('a', club());
    const [item] = (await localBadgeItems([summary('a', { shared: true })], 'XContest', { repo }))!;

    expect(item.flight.maxAgl).toBe(900);
  });

  it('skips manual and demo flights and reports progress', async () => {
    const { repo } = fakeRepo([flight('a')]);
    const progress = vi.fn();
    const items = await localBadgeItems([summary('a'), summary('m', { manual: true }), summary('demo-1')], 'X', {
      repo,
      onProgress: progress
    });

    expect(items).toHaveLength(1);
    expect(progress).toHaveBeenCalledWith(1, 1);
  });

  it('skips a flight that fails and stops when superseded', async () => {
    const { repo } = fakeRepo([flight('b')]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await localBadgeItems([summary('missing'), summary('b')], 'X', { repo })).toHaveLength(1);

    repo.get.mockRejectedValueOnce(new Error('boom'));
    expect(await localBadgeItems([summary('b')], 'X', { repo })).toHaveLength(1);
    expect(await localBadgeItems([summary('b')], 'X', { repo, isCurrent: () => false })).toBeNull();
  });
});
