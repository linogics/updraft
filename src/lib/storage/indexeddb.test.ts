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

describe('manual entries, meta and backup', () => {
  const fresh = () => new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
  const entry = { date: '2026-07-01', pilot: 'Ann', glider: null, site: 'Hill', durationMin: 90, notes: 'n' };

  it('saves a manual entry only as summary', async () => {
    const repo = fresh();
    await repo.saveManual({ ...entry, id: 'm' });
    const [s] = await repo.list();

    expect(s).toMatchObject({ id: 'm', manual: true, fixCount: 0, sourceName: '' });
    expect(s.endTime - s.startTime).toBe(90 * 60_000);
    expect(await repo.get('m')).toBeUndefined();
  });

  it('generates an id when missing and deletes manual entries', async () => {
    const repo = fresh();
    await repo.saveManual(entry);
    const [s] = await repo.list();
    expect(s.id).toBeTruthy();
    await repo.delete(s.id);
    expect(await repo.list()).toEqual([]);
  });

  it('updates meta on flight and manual', async () => {
    const repo = fresh();
    await repo.save(flight('a'));
    await repo.saveManual({ ...entry, id: 'm' });
    await repo.updateMeta('a', { site: 'Alps', notes: 'x' });
    await repo.updateMeta('m', { pilot: 'Bob' });

    expect((await repo.get('a'))?.site).toBe('Alps');
    const list = await repo.list();
    expect(list.find((s) => s.id === 'a')).toMatchObject({ site: 'Alps', notes: 'x' });
    expect(list.find((s) => s.id === 'm')?.pilot).toBe('Bob');
  });

  it('computes maxAlt and trackKm', async () => {
    const repo = fresh();
    await repo.save({ ...flight('a'), fixes: [{ t: 0, lat: 47, lon: 11, alt: 900 }, { t: 1000, lat: 47.01, lon: 11, alt: 1200 }] });
    const [s] = await repo.list();
    expect(s.maxAlt).toBe(1200);
    expect(s.trackKm).toBeGreaterThan(1);
  });

  it('round-trips a backup in merge and replace mode', async () => {
    const src = fresh();
    await src.save(flight('a'));
    await src.updateMeta('a', { notes: 'keep' });
    await src.saveManual({ ...entry, id: 'm' });
    await src.saveCameraTracks(['a'], tracks());
    const backup = await src.exportAll();

    const merged = fresh();
    await merged.save(flight('other'));
    await merged.importAll(backup, 'merge');
    expect((await merged.list()).map((s) => s.id).sort()).toEqual(['a', 'm', 'other']);
    expect((await merged.list()).find((s) => s.id === 'a')?.notes).toBe('keep');
    expect(await merged.getCameraTracks(['a'])).toEqual(tracks());

    const replaced = fresh();
    await replaced.save(flight('other'));
    await replaced.importAll(backup, 'replace');
    expect((await replaced.list()).map((s) => s.id).sort()).toEqual(['a', 'm']);
    expect(await replaced.get('other')).toBeUndefined();
  });
});
