import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Flight } from '../domain/model';
import { IndexedDbFlightRepository } from '../storage/indexeddb';
import { SyncEngine } from './engine.svelte';
import { setSyncKeys } from './prefs';
import { BASE, newServer, serverFetch, stubBrowser, TOKEN_A, TOKEN_B } from './testing';
import { SyncApi } from './v2/http';

const flight = (id: string, pilot = 'P'): Flight => ({
  id,
  sourceName: `${id}.igc`,
  pilot,
  glider: null,
  site: null,
  date: '2026-07-15',
  fixes: [
    { t: 0, lat: 47, lon: 11, alt: 1000 },
    { t: 1000, lat: 47.001, lon: 11, alt: 1010 }
  ]
});

type Handle = ReturnType<typeof newServer>;

const device = (
  handle: Handle,
  opts: { token?: string; maxPage?: number; cooldownMs?: number; debounceMs?: number } = {}
) => {
  const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
  const api = new SyncApi({ url: BASE, token: () => opts.token ?? TOKEN_A, fetch: serverFetch(handle) });
  return { repo, api, engine: new SyncEngine(repo, api, { cooldownMs: 0, ...opts }) };
};

beforeEach(stubBrowser);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SyncEngine', () => {
  it('converges two devices and tracks stay on the server only until opened', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const handle = newServer();
    const a = device(handle);
    const b = device(handle);

    await a.repo.save(flight('f'), {
      id: 'f',
      type: 'application/vnd.fai.igc',
      bytes: new TextEncoder().encode('IGC').buffer
    });
    await a.engine.syncNow();
    await b.engine.syncNow();

    // The listing comes from metadata, the fixes are not on this device.
    expect((await b.repo.summary('f'))?.pilot).toBe('P');
    expect(await b.repo.get('f')).toBeUndefined();
    expect(await b.api.getTrackJson('f')).toHaveLength(2);
    const original = await handle(
      new Request(`${BASE}/api/updraft/v2/flights/f/track`, { headers: { authorization: `Bearer ${TOKEN_A}` } })
    );
    expect(original.headers.get('content-type')).toBe('application/vnd.fai.igc');

    vi.setSystemTime(2000);
    await b.repo.updateMeta('f', { pilot: 'edited' });
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect((await a.repo.get('f'))?.pilot).toBe('edited');

    vi.setSystemTime(3000);
    await a.repo.delete('f');
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.repo.summary('f')).toBeUndefined();
    expect(a.engine.status).toBe('idle');
    expect(a.engine.lastSyncAt).toBe(3000);
    expect(await a.repo.metas('flights')).toEqual([]);
  });

  it('keeps both changes when two devices edit different fields', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const handle = newServer();
    const a = device(handle);
    const b = device(handle);
    await a.repo.save(flight('f'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    vi.setSystemTime(2000);
    await a.repo.updateMeta('f', { pilot: 'from a' });
    vi.setSystemTime(3000);
    await b.repo.updateMeta('f', { notes: 'from b' });
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    for (const d of [a, b]) {
      expect(await d.repo.summary('f')).toMatchObject({ pilot: 'from a', notes: 'from b' });
    }
  });

  it('later write wins a conflict on the same field', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const handle = newServer();
    const a = device(handle);
    const b = device(handle);
    vi.setSystemTime(1000);
    await a.repo.save(flight('f', 'a'));
    vi.setSystemTime(2000);
    await b.repo.save(flight('f', 'b'));

    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();

    expect((await a.repo.get('f'))?.pilot).toBe('b');
    expect((await b.repo.get('f'))?.pilot).toBe('b');
  });

  it('a delete wins over an edit of the other device', async () => {
    const handle = newServer();
    const a = device(handle);
    const b = device(handle);
    await a.repo.save(flight('f'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    await b.repo.updateMeta('f', { notes: 'edit' });
    await a.repo.delete('f');
    await a.engine.syncNow();
    await b.engine.syncNow();
    await b.engine.syncNow();

    // The edit is newer than nothing, so it revives the item. Both devices end the same.
    await a.engine.syncNow();
    expect(await a.repo.summary('f')).toEqual(await b.repo.summary('f'));
  });

  it('pages the feed per collection and stores the cursors', async () => {
    const handle = newServer();
    const a = device(handle);
    const b = device(handle, { maxPage: 40 });
    for (let i = 0; i < 90; i++) await a.repo.save(flight(`f${i}`));
    await a.repo.saveCameraTracks(['f0'], await a.repo.getCameraTracks(['f0']));

    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(await b.repo.list()).toHaveLength(90);
    const { cursors } = await b.repo.getSyncState();
    expect(cursors.flights).toBeTruthy();
    expect(cursors['camera-paths']).toBeTruthy();
  });

  it('starts again from the beginning when the server does not know the cursor', async () => {
    const handle = newServer();
    const a = device(handle);
    await a.repo.save(flight('f'));
    await a.engine.syncNow();
    await a.repo.setSyncState({ cursors: { flights: '99999' } });
    await a.repo.deleteMeta('flights', 'f');
    await a.repo.delete('f');
    await a.repo.deleteMeta('flights', 'f');

    await a.engine.syncNow();

    expect(a.engine.status).toBe('idle');
    expect(await a.repo.summary('f')).toBeDefined();
  });

  it('is single-flight and has a cooldown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10_000);
    const handle = newServer();
    const a = device(handle, { cooldownMs: 5000 });
    const spy = vi.spyOn(a.api, 'listChanges');

    const first = a.engine.syncNow();
    expect(a.engine.syncNow()).toBe(first);
    await first;
    const calls = spy.mock.calls.length;

    await a.engine.syncNow();
    expect(spy.mock.calls.length).toBe(calls);

    vi.setSystemTime(16_000);
    await a.engine.syncNow();
    expect(spy.mock.calls.length).toBe(calls * 2);
  });

  it('sets error status without throwing', async () => {
    const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
    const api = new SyncApi({ url: BASE, token: () => 'x', fetch: () => Promise.reject(new Error('boom')) });
    const engine = new SyncEngine(repo, api, { cooldownMs: 0 });
    await repo.save(flight('f'));

    await engine.syncNow();

    expect(engine.status).toBe('error');
    expect(engine.lastError).toBe('boom');
    expect((await repo.metas('flights'))[0].dirty).toBe(true);
  });

  it('reports a refused token', async () => {
    const a = device(newServer(), { token: 'bad' });

    await a.engine.syncNow();

    expect(a.engine.status).toBe('error');
    expect(a.engine.lastError).toBe('Signed out, sign in again.');
  });

  it('keeps the accounts apart', async () => {
    const handle = newServer();
    const a = device(handle);
    const b = device(handle, { token: TOKEN_B });
    await a.repo.save(flight('f'));
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(await b.repo.list()).toEqual([]);
  });

  it('syncs prefs without echo and keeps the layout local', async () => {
    const handle = newServer();
    const a = device(handle);
    const b = device(handle);
    localStorage.setItem('units', JSON.stringify({ speed: 'kmh' }));
    localStorage.setItem('studioLayout', '{"x":1}');

    await a.engine.syncNow();
    const feed = await a.api.listChanges('prefs', null, 100);
    expect(feed.items.map((i) => i.id)).toEqual(['units']);

    localStorage.clear();
    await b.engine.syncNow();
    expect(JSON.parse(localStorage.getItem('units') ?? 'null')).toEqual({ speed: 'kmh' });

    await b.engine.syncNow();
    await a.engine.syncNow();
    expect((await a.api.listChanges('prefs', null, 100)).cursor).toBe(feed.cursor);
  });

  it('does not let a first-contact local pref beat the server value', async () => {
    const handle = newServer();
    const other = device(handle);
    localStorage.setItem('units', JSON.stringify({ speed: 'new' }));
    await other.engine.syncNow();

    localStorage.setItem('units', JSON.stringify({ speed: 'old' }));
    const a = device(handle);
    await a.engine.syncNow();

    expect(JSON.parse(localStorage.getItem('units') ?? 'null')).toEqual({ speed: 'new' });
  });

  it('syncs api keys only with opt-in and marks them secret', async () => {
    const handle = newServer();
    const a = device(handle);
    localStorage.setItem('openaipKey', 'secret');

    await a.engine.syncNow();
    expect((await a.api.listChanges('prefs', null, 100)).items).toEqual([]);

    setSyncKeys(true);
    await a.engine.syncNow();
    expect((await a.api.listChanges('prefs', null, 100)).items).toMatchObject([
      { id: 'openaipKey', data: { value: 'secret' }, secret: true }
    ]);
  });

  it('pushes after local changes once started', async () => {
    const handle = newServer();
    const a = device(handle, { debounceMs: 10 });
    a.engine.start();
    await vi.waitFor(() => expect(a.engine.lastSyncAt).not.toBeNull());

    await a.repo.save(flight('f'));

    await vi.waitFor(async () => expect((await a.api.listChanges('flights', null, 100)).items).toHaveLength(1));
    a.engine.stop();
    await a.repo.save(flight('g'));
    await new Promise((r) => setTimeout(r, 50));
    expect((await a.api.listChanges('flights', null, 100)).items).toHaveLength(1);
  });
});
