import { describe, expect, it } from 'vitest';

import type { BackendAdapter } from '../sync/types';
import { loadClub, loadClubFlight } from './index';

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
const adapter = (club?: BackendAdapter['club']) => ({ club }) as BackendAdapter;

describe('club loading', () => {
  it('drops entries with a bad summary and is empty without club support', async () => {
    const club = {
      list: async () => [
        { key: '1', owner: 'o', mine: false, stats: good },
        { key: '2', owner: 'o', mine: false, stats: { ...good, durationS: 'x' } },
        { key: '3', owner: 'o', mine: false, stats: null }
      ],
      flight: async () => null
    };

    expect((await loadClub(adapter(club))).map((e) => e.key)).toEqual(['1']);
    expect(await loadClub(adapter())).toEqual([]);
  });

  it('accepts only a valid flight', async () => {
    const flight = { id: 'f', fixes: [{ t: 0, lat: 1, lon: 1, alt: 1 }] };
    const club = (data: unknown) => ({ list: async () => [], flight: async () => data });

    expect(await loadClubFlight(adapter(club(flight)), 'k')).toEqual(flight);
    await expect(loadClubFlight(adapter(club({ id: 'f' })), 'k')).rejects.toThrow(/not valid/);
    await expect(loadClubFlight(adapter(), 'k')).rejects.toThrow(/not valid/);
  });
});
