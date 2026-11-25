import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flight } from '../domain/model';
import type { BackendPlugin } from '../plugins/backendKind';
import { IndexedDbFlightRepository } from '../storage/indexeddb';
import { SyncClient } from './client.svelte';
import type { AuthMethod, BackendAdapter, BackendSession, SyncChange } from './types';

const flight = (id: string): Flight => ({
  id,
  sourceName: `${id}.igc`,
  pilot: 'P',
  glider: null,
  site: null,
  date: '2026-07-15',
  fixes: [{ t: 0, lat: 47, lon: 11, alt: 1000 }]
});

const CONFIG = { backend: 'test/fake', url: 'http://localhost:8090' };

/** In memory backend. The session survives like a stored token. */
class Fake {
  user: string | null = null;
  log: SyncChange[] = [];
  methods: AuthMethod[] = [{ kind: 'password' }];
  pullCursors: (string | null)[] = [];
  signInCalls = 0;
  withClub = false;

  adapter(): BackendAdapter {
    return {
      authMethods: async () => this.methods,
      signIn: async (_m, input) => {
        this.signInCalls++;
        this.user = input?.identity ?? 'pilot';
        return { user: this.user } satisfies BackendSession;
      },
      signOut: async () => void (this.user = null),
      session: () => (this.user ? { user: this.user } : null),
      club: this.withClub ? { list: async () => [], flight: async () => ({}) } : undefined,
      push: async (changes) => void this.log.push(...changes),
      pull: async (cursor) => {
        this.pullCursors.push(cursor);
        return { changes: this.log.slice(Number(cursor ?? 0)), cursor: String(this.log.length) };
      }
    };
  }
}

const setup = (fake: Fake) => {
  const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
  const plugin = { create: () => fake.adapter() } as unknown as BackendPlugin;
  const client = new SyncClient({ repo, loadBackend: async () => plugin, engine: { cooldownMs: 0, debounceMs: 0 } });
  return { repo, client };
};

const configure = (config: unknown = CONFIG) => localStorage.setItem('syncConfig', JSON.stringify(config));

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  });
  vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false }))
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('SyncClient', () => {
  it('starts the engine on init only with a stored session', async () => {
    const fake = new Fake();
    const a = setup(fake);
    configure();
    await a.client.init();

    expect(a.client.engine).toBeNull();
    expect(a.client.methods).toEqual([{ kind: 'password' }]);

    fake.user = 'pilot';
    const b = setup(fake);
    await b.client.init();

    expect(b.client.engine).not.toBeNull();
    expect(b.client.session).toEqual({ user: 'pilot' });
    await b.client.disconnect();
  });

  it('offers the club only when signed in to a server that has one', async () => {
    const fake = new Fake();
    fake.withClub = true;
    const { client } = setup(fake);
    configure();
    await client.init();

    expect(client.hasClub).toBe(false);
    expect(() => client.clubEntries()).toThrow('Sign in');

    await client.signIn({ kind: 'password' }, { identity: 'pilot', password: 'x' });

    expect(client.hasClub).toBe(true);
    expect(await client.clubEntries()).toEqual([]);
    await client.disconnect();

    const plain = setup(new Fake());
    plain.client.session = { user: 'x' };
    expect(plain.client.hasClub).toBe(false);
  });

  it('does nothing without a config', async () => {
    const { client } = setup(new Fake());
    await client.init();

    expect(client.ready).toBe(true);
    expect(client.config).toBeNull();
  });

  it('reports a backend that cannot load and keeps going', async () => {
    const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
    const client = new SyncClient({
      repo,
      loadBackend: async () => {
        throw new Error('not installed');
      }
    });
    configure();
    await client.init();

    expect(client.error).toBe('not installed');
    expect(client.ready).toBe(true);
  });

  it('calls the adapter synchronously inside signIn', async () => {
    const fake = new Fake();
    const { client } = setup(fake);
    configure();
    await client.init();

    const done = client.signIn({ kind: 'password' }, { identity: 'a@x' });
    expect(fake.signInCalls).toBe(1);
    await done;
    await client.disconnect();
  });

  it('uploads everything on the first sign in and switches accounts', async () => {
    const fake = new Fake();
    const { client, repo } = setup(fake);
    await repo.save(flight('f'));
    configure();
    await client.init();

    await client.signIn({ kind: 'password' }, { identity: 'a@x' });

    expect(fake.log.map((c) => c.id)).toContain('f');
    expect((await repo.getSyncState()).account).toBe('test/fake|http://localhost:8090|a@x');

    // The engine pulled the first account's data, so the cursor is set.
    expect((await repo.getSyncState()).cursor).not.toBeNull();
    fake.log = [];
    await client.signOut();
    await client.signIn({ kind: 'password' }, { identity: 'b@x' });

    expect(fake.pullCursors.at(-1)).toBeNull();
    expect(fake.log.map((c) => c.id)).toContain('f');
    await client.disconnect();
  });

  it('keeps cursor and pending state for the same account', async () => {
    const fake = new Fake();
    const { client, repo } = setup(fake);
    configure();
    await client.init();
    await client.signIn({ kind: 'password' }, { identity: 'a@x' });
    await repo.save(flight('late'));
    await client.signOut();
    const cursor = (await repo.getSyncState()).cursor;
    fake.log = [];

    await client.signIn({ kind: 'password' }, { identity: 'a@x' });

    expect(fake.pullCursors.at(-1)).toBe(cursor);
    // Only what is still dirty goes up, "late" was never pushed before the switch back.
    expect(fake.log.map((c) => c.id)).toEqual(['late']);
    await client.disconnect();
  });

  it('signOut keeps local data and stops the engine', async () => {
    const fake = new Fake();
    const { client, repo } = setup(fake);
    await repo.save(flight('f'));
    configure();
    await client.init();
    await client.signIn({ kind: 'password' }, { identity: 'a@x' });

    await client.signOut();

    expect(client.engine).toBeNull();
    expect(client.session).toBeNull();
    expect((await repo.list()).map((f) => f.id)).toEqual(['f']);
  });

  it('tells subscribers when a pull applied records', async () => {
    const fake = new Fake();
    fake.log.push({ type: 'flight', id: 'remote', updatedAt: 5, data: flight('remote') });
    const { client, repo } = setup(fake);
    configure();
    await client.init();
    const seen: number[] = [];
    const off = client.onApplied((n) => seen.push(n));

    await client.signIn({ kind: 'password' }, { identity: 'a@x' });

    expect(seen).toEqual([1]);
    expect((await repo.list()).map((f) => f.id)).toContain('remote');
    off();
    await client.disconnect();
  });

  it('rejects an invalid server before touching storage', async () => {
    const { client } = setup(new Fake());
    await client.connect({ backend: 'test/fake', url: 'http://evil.example' });

    expect(client.config).toBeNull();
    expect(client.error).not.toBeNull();
    expect(localStorage.getItem('syncConfig')).toBeNull();
  });
});
