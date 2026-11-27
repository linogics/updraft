import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Flight } from '../domain/model';
import type { SyncChange } from '../sync/types';
import { IndexedDbFlightRepository } from './indexeddb';

const flight = (id: string): Flight => ({
  id,
  sourceName: `${id}.igc`,
  pilot: 'P',
  glider: null,
  site: null,
  date: '2026-07-15',
  fixes: [{ t: 0, lat: 47, lon: 11, alt: 1000 }]
});

const repoOf = () => new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
const remote = (id: string, updatedAt: number, extra: Partial<SyncChange> = {}): SyncChange => ({
  type: 'flight',
  id,
  updatedAt,
  data: flight(id),
  ...extra
});

afterEach(() => vi.useRealTimers());

describe('sync metadata', () => {
  it('marks every write dirty with updatedAt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const repo = repoOf();
    await repo.save(flight('f'));
    await repo.saveManual({
      id: 'm',
      date: '2026-01-01',
      pilot: 'P',
      glider: null,
      site: null,
      durationMin: 5,
      notes: ''
    });
    await repo.saveCameraTracks(['b', 'a'], await repo.getCameraTracks([]));

    const pending = await repo.pendingChanges();

    expect(pending.map((c) => [c.type, c.id, c.updatedAt]).sort()).toEqual([
      ['cameraPath', 'a|b', 1000],
      ['flight', 'f', 1000],
      ['manual', 'm', 1000]
    ]);
  });

  it('uses the generated id of a manual entry', async () => {
    const repo = repoOf();
    await repo.saveManual({ date: '2026-01-01', pilot: 'P', glider: null, site: null, durationMin: 5, notes: '' });

    const [c] = await repo.pendingChanges();

    expect(c.id).toBe((await repo.list())[0].id);
  });

  it('updateMeta marks the flight dirty', async () => {
    const repo = repoOf();
    await repo.save(flight('f'));
    await repo.markPushed(await repo.pendingChanges());
    await repo.updateMeta('f', { notes: 'hi' });

    const [c] = await repo.pendingChanges();

    expect(c).toMatchObject({ type: 'flight', id: 'f', data: { notes: 'hi' } });
  });

  it('leaves a tombstone on delete', async () => {
    const repo = repoOf();
    await repo.save(flight('f'));
    await repo.delete('f');

    const pending = await repo.pendingChanges();

    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: 'flight', id: 'f', deleted: true });
    expect(pending[0].data).toBeUndefined();
  });

  it('importAll marks records dirty and replace tombstones what it removed', async () => {
    const repo = repoOf();
    await repo.save(flight('old'));
    await repo.markPushed(await repo.pendingChanges());
    const backup = await repo.exportAll();
    backup.flights = [flight('new')];

    await repo.importAll(backup, 'replace');

    const pending = await repo.pendingChanges();
    expect(pending.map((c) => `${c.id}:${c.deleted ?? false}`).sort()).toEqual(['new:false', 'old:true']);
  });

  it('markPushed keeps a record dirty when it was rewritten during the push', async () => {
    const repo = repoOf();
    await repo.save(flight('f'));
    const pushed = await repo.pendingChanges();
    await repo.save({ ...flight('f'), pilot: 'changed' });

    await repo.markPushed(pushed);

    const pending = await repo.pendingChanges();
    expect(pending).toHaveLength(1);
    expect(pending[0].updatedAt).toBeGreaterThan(pushed[0].updatedAt);
    await repo.markPushed(pending);
    expect(await repo.pendingChanges()).toEqual([]);
  });
});

describe('applyRemote', () => {
  it('applies newer, ignores older and equal, and does not mark dirty', async () => {
    const repo = repoOf();

    expect(await repo.applyRemote([remote('f', 100)])).toEqual({ applied: 1, invalid: 0 });
    expect(await repo.pendingChanges()).toEqual([]);

    const newer = remote('f', 200, { data: { ...flight('f'), pilot: 'new' } });
    await repo.applyRemote([newer]);
    expect((await repo.get('f'))?.pilot).toBe('new');
    expect((await repo.list())[0].pilot).toBe('new');

    await repo.applyRemote([remote('f', 150, { data: { ...flight('f'), pilot: 'old' } })]);
    await repo.applyRemote([remote('f', 200, { data: { ...flight('f'), pilot: 'echo' } })]);
    expect((await repo.get('f'))?.pilot).toBe('new');
  });

  it('tombstone deletes the record with its xc scores and blocks older data', async () => {
    const repo = repoOf();
    await repo.applyRemote([remote('f', 100)]);
    await repo.putXcScore('f', 'FAI', null);

    await repo.applyRemote([{ type: 'flight', id: 'f', updatedAt: 200, deleted: true }]);
    await repo.applyRemote([remote('f', 150)]);

    expect(await repo.get('f')).toBeUndefined();
    expect(await repo.list()).toEqual([]);
    expect(await repo.getXcScore('f', 'FAI')).toBeUndefined();
    expect(await repo.pendingChanges()).toEqual([]);
  });

  it('skips and counts invalid changes without failing the batch', async () => {
    const repo = repoOf();
    const bad = [
      { type: 'flight', id: 'x', updatedAt: 1, data: { id: 'x', fixes: [] } },
      { type: 'flight', id: 'x', updatedAt: 1, data: flight('other') },
      { type: 'flight', id: 'nodate', updatedAt: 1, data: { ...flight('nodate'), date: undefined } },
      { type: 'manual', id: 'm', updatedAt: 1, data: { id: 'm', date: 'd' } },
      { type: 'cameraPath', id: 'c', updatedAt: 1, data: { key: 5 } },
      { type: 'flight', id: 'x', updatedAt: NaN, data: flight('x') },
      { type: 'bogus', id: 'x', updatedAt: 1 },
      null
    ] as unknown as SyncChange[];

    const result = await repo.applyRemote([...bad, remote('ok', 5)]);

    expect(result).toEqual({ applied: 1, invalid: 8 });
    expect(await repo.get('ok')).toBeDefined();
  });

  it('applies manual entries and camera paths', async () => {
    const repo = repoOf();
    const tracks = await repo.getCameraTracks([]);
    const manual = {
      id: 'm',
      sourceName: '',
      pilot: 'P',
      glider: null,
      site: null,
      date: '2026-01-01',
      fixCount: 0,
      startTime: 0,
      endTime: 1,
      manual: true as const
    };

    await repo.applyRemote([
      { type: 'manual', id: 'm', updatedAt: 1, data: manual },
      { type: 'cameraPath', id: 'a|b', updatedAt: 1, data: { key: 'a|b', tracks } }
    ]);

    expect((await repo.list()).map((s) => s.id)).toEqual(['m']);
    expect(await repo.pendingChanges()).toEqual([]);
  });

  it('keeps and restores sync state', async () => {
    const repo = repoOf();
    expect(await repo.getSyncState()).toEqual({ cursor: null, prefs: {} });

    await repo.setSyncState({ cursor: '7', prefs: { units: { raw: '1', updatedAt: 2 } } });

    expect((await repo.getSyncState()).cursor).toBe('7');
  });
});

describe('markAllDirty', () => {
  it('uploads pushed records and tombstones again and keeps updatedAt', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const repo = repoOf();
    await repo.save(flight('f'));
    await repo.save(flight('gone'));
    await repo.delete('gone');
    await repo.markPushed(await repo.pendingChanges());
    expect(await repo.pendingChanges()).toEqual([]);

    vi.setSystemTime(9000);
    await repo.markAllDirty();
    const pending = await repo.pendingChanges();

    expect(pending.map((c) => [c.id, c.updatedAt, c.deleted ?? false]).sort()).toEqual([
      ['f', 1000, false],
      ['gone', 1001, true]
    ]);
  });
});
