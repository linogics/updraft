import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import type { Flight } from '../domain/model';
import { chain, straight } from '../domain/testing/tracks';
import { IndexedDbFlightRepository } from '../storage/indexeddb';
import { isFlight } from '../storage/validate';
import { shareFlight } from './share';

const flight: Flight = {
  id: 'f',
  sourceName: 'x.igc',
  pilot: 'P',
  glider: null,
  site: null,
  date: '2026-07-15',
  fixes: chain((f) => straight(f, { headingDeg: 90, speed: 10, climb: 0, duration: 60 }))
};

const setup = async () => {
  const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
  await repo.save(flight);
  await repo.markPushed('flights', 'f', (await repo.getMeta('flights', 'f'))!.rev, '1');
  return repo;
};

describe('shareFlight', () => {
  it('stores the club stats, marks the flight dirty and drops them again on unshare', async () => {
    const repo = await setup();

    await shareFlight('f', ['c1'], { repo, ground: async () => undefined });
    const shared = await repo.get('f');
    expect(shared?.clubs).toEqual(['c1']);
    expect(shared?.club).toMatchObject({ v: 1, pilot: 'P', durationS: 60 });
    expect(shared?.club?.maxAgl).toBeUndefined();
    expect(isFlight(shared)).toBe(true);
    expect(await repo.getMeta('flights', 'f')).toMatchObject({ dirty: true });
    expect((await repo.getMeta('flights', 'f'))?.times).toHaveProperty('clubs');

    await shareFlight('f', ['c1', 'c2'], { repo });
    expect((await repo.get('f'))?.clubs).toEqual(['c1', 'c2']);

    await shareFlight('f', [], { repo });
    const off = await repo.get('f');
    expect(off?.clubs).toEqual([]);
    expect(off && 'club' in off).toBe(false);
  });

  it('adds AGL when ground heights are available', async () => {
    const repo = await setup();

    await shareFlight('f', ['c1'], { repo, ground: async (fx) => Float32Array.from(fx, () => 1250) });

    expect((await repo.get('f'))?.club?.maxAgl).toBe(250);
  });

  it('throws for an unknown flight', async () => {
    await expect(shareFlight('nope', ['c1'], { repo: await setup() })).rejects.toThrow(/not found/);
  });
});
