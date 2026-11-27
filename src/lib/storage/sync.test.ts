import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Flight } from '../domain/model';
import type { Item } from '../sync/v2/http';
import { flightData, IndexedDbFlightRepository } from './indexeddb';

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
const entry = { date: '2026-07-01', pilot: 'Ann', glider: null, site: null, durationMin: 60, notes: '' };

/** A flight item as the server would hold it. */
const remote = async (id: string, version: string, times = 1, extra: Record<string, unknown> = {}): Promise<Item> => {
  const repo = repoOf();
  await repo.save(flight(id));
  const data = { ...(await repo.readData('flights', id)), ...extra };
  return { id, version, deleted: false, data, times: Object.fromEntries(Object.keys(data).map((k) => [k, times])) };
};

afterEach(() => vi.useRealTimers());

describe('sync metadata', () => {
  it('marks every write dirty with a time per changed field', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const repo = repoOf();
    await repo.save(flight('f'));

    const meta = await repo.getMeta('flights', 'f');
    expect(meta).toMatchObject({
      dirty: true,
      deleted: false,
      version: null,
      tracksPushed: { original: false, json: false }
    });
    expect(meta?.times.pilot).toBe(1000);

    vi.setSystemTime(2000);
    await repo.updateMeta('f', { notes: 'n', pilot: 'P' });
    const next = await repo.getMeta('flights', 'f');
    expect(next?.times.notes).toBe(2000);
    // An unchanged field keeps its time.
    expect(next?.times.pilot).toBe(1000);
  });

  it('syncs a manual entry as a flight without a track', async () => {
    const repo = repoOf();
    await repo.saveManual({ ...entry, id: 'm' });

    expect(await repo.readData('flights', 'm')).toMatchObject({ hasTrack: false, pilot: 'Ann' });
    expect((await repo.getMeta('flights', 'm'))?.tracksPushed).toBeUndefined();
  });

  it('a delete of an item the server never saw leaves nothing', async () => {
    const repo = repoOf();
    await repo.save(flight('f'));
    await repo.delete('f');

    expect(await repo.metas('flights')).toEqual([]);
  });

  it('a delete of a known item leaves a tombstone, and the track and original go', async () => {
    const repo = repoOf();
    await repo.save(flight('f'), { id: 'f', type: 't', bytes: new ArrayBuffer(1) });
    await repo.markPushed('flights', 'f', (await repo.getMeta('flights', 'f'))!.rev, '5');
    await repo.delete('f');

    expect(await repo.getMeta('flights', 'f')).toMatchObject({ deleted: true, dirty: true, version: '5' });
    expect(await repo.trackUpload('f')).toBeUndefined();
  });

  it('importAll marks records dirty and replace tombstones what it removed', async () => {
    const repo = repoOf();
    await repo.save(flight('gone'));
    await repo.markPushed('flights', 'gone', (await repo.getMeta('flights', 'gone'))!.rev, '1');
    const backup = { ...(await repo.exportAll()), flights: [flight('kept')], manual: [] };

    await repo.importAll(backup, 'replace');

    expect(await repo.getMeta('flights', 'gone')).toMatchObject({ deleted: true, dirty: true });
    expect(await repo.getMeta('flights', 'kept')).toMatchObject({ dirty: true });
  });

  it('markPushed keeps a record dirty when it was rewritten during the push', async () => {
    const repo = repoOf();
    await repo.save(flight('f'));
    const first = await repo.getMeta('flights', 'f');
    await repo.updateMeta('f', { notes: 'again' });

    await repo.markPushed('flights', 'f', first!.rev, '3');

    expect(await repo.getMeta('flights', 'f')).toMatchObject({ dirty: true, version: '3' });
  });
});

describe('applyRemote', () => {
  it('stores a clean remote flight as metadata without a track', async () => {
    const repo = repoOf();
    const item = await remote('r', '4', 1, { hasTrack: true });

    expect(await repo.applyRemote('flights', item)).toBe('applied');

    expect(await repo.summary('r')).toMatchObject({ id: 'r', hasTrack: true });
    expect(await repo.get('r')).toBeUndefined();
    expect(await repo.getMeta('flights', 'r')).toMatchObject({
      dirty: false,
      version: '4',
      tracksPushed: { original: true, json: true }
    });
    expect(await repo.applyRemote('flights', item)).toBe('skipped');
  });

  it('merges field by field into a dirty item and keeps it dirty with the new version', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const repo = repoOf();
    await repo.save(flight('f'));
    vi.setSystemTime(5000);
    await repo.updateMeta('f', { notes: 'mine' });
    const item = await remote('f', '9', 3, { pilot: 'theirs', notes: 'theirs' });
    item.times = { ...item.times, pilot: 9000 };

    await repo.applyRemote('flights', item);

    const s = await repo.summary('f');
    expect(s).toMatchObject({ pilot: 'theirs', notes: 'mine' });
    expect(await repo.getMeta('flights', 'f')).toMatchObject({ dirty: true, version: '9' });
  });

  it('a tombstone deletes the record with its xc scores', async () => {
    const repo = repoOf();
    await repo.applyRemote('flights', await remote('f', '1'));
    await repo.putXcScore('f', 'FFVL', null);

    await repo.applyRemote('flights', { id: 'f', version: '2', deleted: true });

    expect(await repo.summary('f')).toBeUndefined();
    expect(await repo.getXcScore('f', 'FFVL')).toBeUndefined();
    expect(await repo.getMeta('flights', 'f')).toBeUndefined();
  });

  it('a local edit wins over a remote delete', async () => {
    const repo = repoOf();
    await repo.save(flight('f'));

    await repo.applyRemote('flights', { id: 'f', version: '2', deleted: true });

    expect(await repo.summary('f')).toBeDefined();
    expect(await repo.getMeta('flights', 'f')).toMatchObject({ dirty: true, version: '2' });
  });

  it('skips invalid items without failing', async () => {
    const repo = repoOf();

    expect(await repo.applyRemote('flights', { id: 'x', version: '1', deleted: false, data: { pilot: 5 } })).toBe(
      'invalid'
    );
    expect(await repo.applyRemote('camera-paths', { id: 'x', version: '1', deleted: false, data: {} })).toBe('invalid');
    expect(await repo.list()).toEqual([]);
  });

  it('applies camera paths', async () => {
    const repo = repoOf();
    const item: Item = { id: 'a|b', version: '1', deleted: false, data: { tracks: {} }, times: { tracks: 1 } };

    expect(await repo.applyRemote('camera-paths', item)).toBe('applied');
    expect(await repo.readData('camera-paths', 'a|b')).toEqual({ tracks: {} });
  });
});

describe('sync state and markAllDirty', () => {
  it('keeps and restores sync state', async () => {
    const repo = repoOf();
    expect(await repo.getSyncState()).toEqual({ cursors: {} });

    await repo.setSyncState({ cursors: { flights: '7' }, account: 'x' });
    expect(await repo.getSyncState()).toEqual({ cursors: { flights: '7' }, account: 'x' });
  });

  it('uploads pushed records again as creates and forgets tombstones and prefs', async () => {
    const repo = repoOf();
    await repo.save(flight('f'));
    await repo.save(flight('d'));
    await repo.markPushed('flights', 'f', (await repo.getMeta('flights', 'f'))!.rev, '3');
    await repo.markPushed('flights', 'd', (await repo.getMeta('flights', 'd'))!.rev, '4');
    await repo.delete('d');
    await repo.putMeta({
      key: 'prefs:units',
      collection: 'prefs',
      id: 'units',
      version: '1',
      dirty: false,
      deleted: false,
      times: {},
      rev: 1
    });

    await repo.markAllDirty();

    expect(await repo.getMeta('flights', 'f')).toMatchObject({
      dirty: true,
      version: null,
      tracksPushed: { original: false, json: false }
    });
    expect(await repo.getMeta('flights', 'd')).toBeUndefined();
    expect(await repo.getMeta('prefs', 'units')).toBeUndefined();
  });

  it('flightData leaves out the id and the manual marker', () => {
    expect(flightData({ id: 'x', manual: true, hasTrack: false, pilot: 'p', notes: undefined } as never)).toEqual({
      hasTrack: false,
      pilot: 'p'
    });
  });
});
