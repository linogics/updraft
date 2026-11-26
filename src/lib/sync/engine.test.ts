import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Flight } from '../domain/model';
import { IndexedDbFlightRepository } from '../storage/indexeddb';
import { SyncEngine } from './engine.svelte';
import { setSyncKeys } from './prefs';
import type { SyncChange, SyncTransport } from './types';

const flight = (id: string, pilot = 'P'): Flight => ({
  id,
  sourceName: `${id}.igc`,
  pilot,
  glider: null,
  site: null,
  date: '2026-07-15',
  fixes: [{ t: 0, lat: 47, lon: 11, alt: 1000 }]
});

/** Change log with the log index as cursor. Page size shows the pagination. */
class FakeServer {
  log: SyncChange[] = [];
  pushes: number[] = [];
  pulls = 0;
  pageSize = 1000;

  transport(): SyncTransport {
    return {
      push: async (changes) => {
        this.pushes.push(changes.length);
        this.log.push(...changes);
      },
      pull: async (cursor) => {
        this.pulls++;
        const from = Number(cursor ?? 0);
        const changes = this.log.slice(from, from + this.pageSize);
        const end = from + changes.length;
        return { changes, cursor: String(end), more: end < this.log.length };
      }
    };
  }
}

const repoOf = () => new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
const device = (server: FakeServer, opts = {}) => {
  const repo = repoOf();
  return { repo, engine: new SyncEngine(repo, server.transport(), { cooldownMs: 0, ...opts }) };
};

// The test environment is node, so storage and window events are stubbed.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear()
  });
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SyncEngine', () => {
  it('converges two devices', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1000);
    const server = new FakeServer();
    const a = device(server);
    const b = device(server);

    await a.repo.save(flight('f'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect((await b.repo.get('f'))?.pilot).toBe('P');

    vi.setSystemTime(2000);
    await b.repo.updateMeta('f', { pilot: 'edited' });
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect((await a.repo.get('f'))?.pilot).toBe('edited');

    vi.setSystemTime(3000);
    await a.repo.delete('f');
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(await b.repo.get('f')).toBeUndefined();
    expect(a.engine.status).toBe('idle');
    expect(a.engine.lastSyncAt).toBe(3000);

    // Nothing echoes back once both are in sync.
    const size = server.log.length;
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(server.log.length).toBe(size);
  });

  it('later write wins a conflict', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const server = new FakeServer();
    const a = device(server);
    const b = device(server);
    vi.setSystemTime(1000);
    await a.repo.save(flight('f', 'a'));
    vi.setSystemTime(2000);
    await b.repo.save(flight('f', 'b'));

    await b.engine.syncNow();
    await a.engine.syncNow();
    await b.engine.syncNow();

    expect((await a.repo.get('f'))?.pilot).toBe('b');
    expect((await b.repo.get('f'))?.pilot).toBe('b');
  });

  it('pages push by 50 and pulls until done', async () => {
    const server = new FakeServer();
    server.pageSize = 40;
    const a = device(server);
    const b = device(server);
    for (let i = 0; i < 120; i++) await a.repo.save(flight(`f${i}`));

    await a.engine.syncNow();
    await b.engine.syncNow();

    expect(server.pushes).toEqual([50, 50, 20]);
    expect(server.pulls).toBeGreaterThanOrEqual(3);
    expect(await b.repo.list()).toHaveLength(120);
    expect((await b.repo.getSyncState()).cursor).toBe('120');
  });

  it('is single-flight and has a cooldown', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(10_000);
    const server = new FakeServer();
    const a = device(server, { cooldownMs: 5000 });

    const first = a.engine.syncNow();
    expect(a.engine.syncNow()).toBe(first);
    await first;
    expect(server.pulls).toBe(1);

    await a.engine.syncNow();
    expect(server.pulls).toBe(1);

    vi.setSystemTime(16_000);
    await a.engine.syncNow();
    expect(server.pulls).toBe(2);
  });

  it('sets error status without throwing', async () => {
    const repo = repoOf();
    const engine = new SyncEngine(
      repo,
      { push: () => Promise.reject(new Error('boom')), pull: () => Promise.reject(new Error('boom')) },
      { cooldownMs: 0 }
    );
    await repo.save(flight('f'));

    await engine.syncNow();

    expect(engine.status).toBe('error');
    expect(engine.lastError).toBe('boom');
    expect(await repo.pendingChanges()).toHaveLength(1);
  });

  it('syncs prefs without echo and keeps the layout local', async () => {
    const server = new FakeServer();
    const a = device(server);
    const b = device(server);
    localStorage.setItem('units', JSON.stringify({ speed: 'kmh' }));
    localStorage.setItem('studioLayout', '{"x":1}');

    await a.engine.syncNow();
    expect(server.log.map((c) => c.id)).toEqual(['units']);

    localStorage.clear();
    await b.engine.syncNow();
    expect(JSON.parse(localStorage.getItem('units') ?? 'null')).toEqual({ speed: 'kmh' });

    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(server.log).toHaveLength(1);
  });

  it('syncs api keys only with opt-in', async () => {
    const server = new FakeServer();
    const a = device(server);
    localStorage.setItem('openaipKey', 'secret');

    await a.engine.syncNow();
    expect(server.log).toEqual([]);

    setSyncKeys(true);
    await a.engine.syncNow();
    expect(server.log).toMatchObject([{ type: 'pref', id: 'openaipKey', data: 'secret' }]);

    localStorage.clear();
    const b = device(server);
    await b.engine.syncNow();
    expect(localStorage.getItem('openaipKey')).toBeNull();

    setSyncKeys(true);
    server.log.push({ type: 'pref', id: 'openaipKey', updatedAt: 1e12, data: 'new' });
    await b.engine.syncNow();
    expect(localStorage.getItem('openaipKey')).toBe('new');
  });

  it('pushes after local changes once started', async () => {
    const server = new FakeServer();
    const a = device(server, { debounceMs: 10 });
    a.engine.start();
    await vi.waitFor(() => expect(server.pulls).toBe(1));

    await a.repo.save(flight('f'));

    await vi.waitFor(() => expect(server.log).toHaveLength(1));
    a.engine.stop();
    await a.repo.save(flight('g'));
    await new Promise((r) => setTimeout(r, 50));
    expect(server.log).toHaveLength(1);
  });
});
