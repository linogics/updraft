import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { IndexedDbFlightRepository } from './indexeddb';
import type { Flight } from '../domain/model';

const flight = (id: string, date = '2026-07-15'): Flight => ({
  id,
  sourceName: `${id}.igc`,
  pilot: `Pilot ${id}`,
  glider: null,
  site: null,
  date,
  fixes: [{ t: 0, lat: 47, lon: 11, alt: 1000 }]
});

describe('IndexedDbFlightRepository', () => {
  it('saves and loads a flight', async () => {
    const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
    await repo.save(flight('a'));

    expect(await repo.get('a')).toEqual(flight('a'));
    expect(await repo.get('missing')).toBeUndefined();
  });

  it('lists summaries newest first without fixes', async () => {
    const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
    await repo.save(flight('old', '2025-05-01'));
    await repo.save(flight('new', '2026-08-01'));

    const list = await repo.list();

    expect(list.map((s) => s.id)).toEqual(['new', 'old']);
    expect(list[0]).not.toHaveProperty('fixes');
    expect(list[0]).toMatchObject({ pilot: 'Pilot new', fixCount: 1 });
  });

  it('deletes a flight', async () => {
    const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
    await repo.save(flight('a'));
    await repo.delete('a');

    expect(await repo.get('a')).toBeUndefined();
    expect(await repo.list()).toEqual([]);
  });
});
