import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Flight } from '../domain/model';
import { IndexedDbFlightRepository } from '../storage/indexeddb';
import { SyncClient } from './client.svelte';
import { newServer, serverFetch, stubBrowser, TOKEN_A } from './testing';

const flight = (id: string): Flight => ({
  id,
  sourceName: `${id}.igc`,
  pilot: 'P',
  glider: null,
  site: null,
  date: '2026-07-15',
  fixes: [{ t: 0, lat: 47, lon: 11, alt: 1000 }]
});

const CONFIG = { url: 'http://localhost:8090' };
const LOGIN = { identity: 'a@example.org', password: 'secret-pass' };
const STORED = `updraft_http_auth:${CONFIG.url}`;

const setup = (handle = newServer({ clubs: { c1: { name: 'One', members: ['acc-a'] } } })) => {
  const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
  const client = new SyncClient({
    repo,
    engine: { cooldownMs: 0, debounceMs: 0 },
    api: { fetch: serverFetch(handle), sleep: async () => {} }
  });
  return { repo, client, handle };
};

const configure = () => localStorage.setItem('syncConfig', JSON.stringify(CONFIG));
const stored = () => localStorage.setItem(STORED, JSON.stringify({ token: TOKEN_A, user: 'a@example.org' }));

beforeEach(() => {
  stubBrowser();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('SyncClient', () => {
  it('starts the engine on init only with a stored session', async () => {
    const a = setup();
    configure();
    await a.client.init();

    expect(a.client.engine).toBeNull();
    expect(a.client.methods).toEqual([{ kind: 'password' }]);

    stored();
    const b = setup();
    await b.client.init();

    expect(b.client.engine).not.toBeNull();
    expect(b.client.session).toEqual({ user: 'a@example.org' });
    b.client.disconnect();
  });

  it('refuses a server that does not speak v2', async () => {
    const { client } = setup();
    configure();
    vi.stubGlobal('fetch', vi.fn());
    const bad = new SyncClient({ repo: setup().repo, api: { fetch: async () => Response.json({ version: 1 }) } });

    await bad.connect(CONFIG);

    expect(bad.error).toBe('This server does not speak sync v2.');
    expect(bad.session).toBeNull();
    expect(client.error).toBeNull();
  });

  it('offers clubs only when signed in to a server that has them', async () => {
    const { client } = setup();
    configure();
    await client.init();

    expect(client.hasClub).toBe(false);
    expect(() => client.clubEntries('c1')).toThrow('Sign in');

    await client.signIn({ kind: 'password' }, LOGIN);

    expect(client.hasClub).toBe(true);
    expect(client.clubs).toEqual([{ id: 'c1', name: 'One' }]);
    expect(await client.clubEntries('c1')).toEqual([]);
    client.disconnect();

    const plain = setup(newServer());
    configure();
    await plain.client.init();
    await plain.client.signIn({ kind: 'password' }, LOGIN);
    expect(plain.client.hasClub).toBe(false);
    plain.client.disconnect();
  });

  it('does nothing without a config', async () => {
    const { client } = setup();
    await client.init();

    expect(client.ready).toBe(true);
    expect(client.config).toBeNull();
  });

  it('shows a wrong password and stays signed out', async () => {
    const { client } = setup();
    configure();
    await client.init();

    await client.signIn({ kind: 'password' }, { identity: 'a@example.org', password: 'nope' });

    expect(client.error).toBe('Wrong email or password');
    expect(client.session).toBeNull();
  });

  it('starts the sign in request synchronously', async () => {
    const { client, handle } = setup();
    configure();
    await client.init();
    const calls: string[] = [];
    const seen = serverFetch(handle);
    const spy = new SyncClient({
      repo: setup().repo,
      api: { fetch: (i, init) => (calls.push(new Request(i).url), seen(i, init)) }
    });
    await spy.connect(CONFIG);
    calls.length = 0;

    const done = spy.signIn({ kind: 'password' }, LOGIN);
    expect(calls.some((c) => c.endsWith('/auth/password'))).toBe(true);
    await done;
    spy.disconnect();
  });

  it('uploads everything on the first sign in and switches accounts', async () => {
    const { client, repo, handle } = setup();
    await repo.save(flight('f'));
    configure();
    await client.init();

    await client.signIn({ kind: 'password' }, LOGIN);

    const res = await handle(
      new Request('http://x/api/updraft/v2/flights', { headers: { authorization: `Bearer ${TOKEN_A}` } })
    );
    expect(((await res.json()) as { items: { id: string }[] }).items.map((i) => i.id)).toEqual(['f']);
    expect((await repo.getSyncState()).account).toBe(`${CONFIG.url}|a@example.org`);
    await client.syncNow();
    expect((await repo.getSyncState()).cursors.flights).toBeTruthy();

    client.signOut();
    // Same account again keeps the cursor.
    const cursor = (await repo.getSyncState()).cursors.flights;
    await client.signIn({ kind: 'password' }, LOGIN);
    expect((await repo.getSyncState()).cursors.flights).toBe(cursor);
    client.disconnect();
  });

  it('signOut keeps local data and stops the engine', async () => {
    const { client, repo } = setup();
    await repo.save(flight('f'));
    configure();
    await client.init();
    await client.signIn({ kind: 'password' }, LOGIN);

    client.signOut();

    expect(client.engine).toBeNull();
    expect(client.session).toBeNull();
    expect(localStorage.getItem(STORED)).toBeNull();
    expect((await repo.list()).map((f) => f.id)).toEqual(['f']);
  });

  it('tells subscribers when a pull applied records and loads a missing track on demand', async () => {
    const handle = newServer();
    const other = setup(handle);
    await other.repo.save(flight('remote'));
    configure();
    await other.client.init();
    await other.client.signIn({ kind: 'password' }, LOGIN);
    other.client.disconnect();

    const { client, repo } = setup(handle);
    configure();
    await client.init();
    const seen: number[] = [];
    const off = client.onApplied((n) => seen.push(n));

    await client.signIn({ kind: 'password' }, LOGIN);

    expect(seen).toEqual([1]);
    expect(await repo.get('remote')).toBeUndefined();
    expect((await client.fetchTrack('remote')).length).toBe(1);
    expect((await repo.get('remote'))?.fixes).toHaveLength(1);
    off();
    client.disconnect();
  });

  it('forgets the token when the server refuses it', async () => {
    const { client } = setup();
    configure();
    localStorage.setItem(STORED, JSON.stringify({ token: 'expired', user: 'a@example.org' }));
    await client.init();

    await client.syncNow();
    await vi.waitFor(() => expect(client.session).toBeNull());

    expect(client.error).toBe('Signed out, sign in again.');
    expect(localStorage.getItem(STORED)).toBeNull();
  });

  it('rejects an invalid server before touching storage', async () => {
    const { client } = setup();
    await client.connect({ url: 'http://evil.example' });

    expect(client.config).toBeNull();
    expect(client.error).not.toBeNull();
    expect(localStorage.getItem('syncConfig')).toBeNull();
  });
});
