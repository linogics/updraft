import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, expect, it } from 'vitest';
import { IndexedDbFlightRepository } from './indexeddb';
import { DEFAULT_TRACKS, type CameraTracks } from '../domain/cameraPath';
import type { Flight } from '../domain/model';

const tracks = (): CameraTracks => ({
  ...DEFAULT_TRACKS,
  heading: { animated: true, value: 0, keys: [{ t: 1000, v: 10, interp: 'linear' }] }
});

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

  it('saves camera tracks and finds them whatever the order of the ids', async () => {
    const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
    await repo.saveCameraTracks(['a', 'b'], tracks());

    expect(await repo.getCameraTracks(['b', 'a'])).toEqual(tracks());
    expect(await repo.getCameraTracks(['a'])).toEqual(DEFAULT_TRACKS);
  });

  it('reads a record of the old keyframe format as the defaults', async () => {
    const name = `db-${crypto.randomUUID()}`;
    const repo = new IndexedDbFlightRepository(name);
    await repo.get('a');
    const raw = await openDB(name);
    await raw.put('cameraPaths', { key: 'a', keys: [{ t: 0, heading: 0, pitch: -30, range: 400 }] });
    raw.close();

    expect(await repo.getCameraTracks(['a'])).toEqual(DEFAULT_TRACKS);
  });

  it('keeps flights when upgrading a version 1 database', async () => {
    const name = `db-${crypto.randomUUID()}`;
    const old = await openDB(name, 1, {
      upgrade(db) {
        db.createObjectStore('flights', { keyPath: 'id' });
        db.createObjectStore('summaries', { keyPath: 'id' });
      }
    });
    await old.put('flights', flight('a'));
    old.close();

    const repo = new IndexedDbFlightRepository(name);
    expect(await repo.get('a')).toEqual(flight('a'));
    await repo.saveCameraTracks(['a'], tracks());
    expect(await repo.getCameraTracks(['a'])).toEqual(tracks());
  });
});
