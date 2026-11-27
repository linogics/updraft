import { describe, expect, it } from 'vitest';

import type { ClubFlight } from '../sync/v2/http';
import { clubFlightOf, clubStudioHref, loadClubFeed } from './index';

const good = {
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
const row = (key: string, extra: Partial<ClubFlight> = {}): ClubFlight => ({
  key,
  owner: 'o',
  mine: false,
  version: '1',
  deleted: false,
  hasTrack: true,
  summary: good,
  ...extra
});

describe('club feed', () => {
  it('pages from the start and drops deleted rows and bad summaries', async () => {
    const pages = [
      {
        items: [row('1'), row('2', { summary: { ...good, durationS: 'x' } }), row('3', { summary: null })],
        cursor: 'a',
        more: true
      },
      { items: [row('4'), row('1', { deleted: true, summary: undefined })], cursor: 'b', more: false }
    ];
    const seen: (string | null)[] = [];

    const entries = await loadClubFeed(async (since) => {
      seen.push(since);
      return pages[seen.length - 1];
    });

    expect(seen).toEqual([null, 'a']);
    expect(entries.map((e) => e.key)).toEqual(['4']);
  });

  it('builds a studio flight and a link with both ids', () => {
    const entry = { key: 'k 1', owner: 'o', mine: false, stats: { ...good, v: 1 as const } };

    expect(clubFlightOf(entry, [{ t: 0, lat: 1, lon: 1, alt: 1 }])).toMatchObject({ id: 'k 1', pilot: 'P' });
    expect(clubStudioHref('c1', 'k 1')).toBe('/studio?club=c1&key=k+1');
  });
});
