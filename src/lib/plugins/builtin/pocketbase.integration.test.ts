// Runs against a REAL PocketBase and is skipped without PB_URL. To repeat it:
//   1. Download pocketbase_0.40.6_linux_amd64.zip from the GitHub release and check it against checksums.txt.
//   2. ./pocketbase --dir <dir> --migrationsDir server/pb_migrations superuser upsert admin@test.local adminpass123
//   3. ./pocketbase serve --dir <dir> --migrationsDir server/pb_migrations --http=127.0.0.1:8090 --automigrate=false
//   4. PB_URL=http://127.0.0.1:8090 PB_ADMIN_EMAIL=admin@test.local PB_ADMIN_PASSWORD=adminpass123 \
//        npm test -- pocketbase.integration
//      Add PB_DB=<dir>/data.db to also run the equal `updated` test.
import 'fake-indexeddb/auto';
import PocketBase from 'pocketbase';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Flight } from '#lib/domain/model';
import { IndexedDbFlightRepository } from '#lib/storage/indexeddb';
import { SyncEngine } from '#lib/sync/engine.svelte';
import type { BackendAdapter, SyncChange } from '#lib/sync/types';
import { createPocketBase } from './pocketbase';

const { PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
const run = PB_URL && PB_ADMIN_EMAIL && PB_ADMIN_PASSWORD ? describe : describe.skip;

const PASSWORD = 'pilot-password-1';
const change = (id: string, updatedAt: number, extra: Partial<SyncChange> = {}): SyncChange => ({
  type: 'flight',
  id,
  updatedAt,
  data: { id },
  ...extra
});
const flight = (id: string): Flight => ({
  id,
  sourceName: `${id}.igc`,
  pilot: 'P',
  glider: null,
  site: null,
  date: '2026-07-15',
  fixes: [{ t: 0, lat: 47, lon: 11, alt: 1000 }]
});

async function pullAll(a: BackendAdapter) {
  const out: SyncChange[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page: Awaited<ReturnType<BackendAdapter['pull']>> = await a.pull(cursor);
    out.push(...page.changes);
    cursor = page.cursor;
    if (!page.more) return { changes: out, cursor };
  }
}

run('PocketBase backend', () => {
  let admin: PocketBase;
  const users: Array<{ email: string; id: string }> = [];

  const newUser = async () => {
    const email = `pilot-${crypto.randomUUID()}@test.local`;
    const rec = await admin
      .collection('users')
      .create({ email, password: PASSWORD, passwordConfirm: PASSWORD, emailVisibility: true });
    users.push({ email, id: rec.id });
    return email;
  };

  const signedIn = async (email: string, pageSize?: number) => {
    const a = createPocketBase({ url: PB_URL!, pageSize });
    await a.signIn({ kind: 'password' }, { identity: email, password: PASSWORD });
    return a;
  };

  beforeAll(async () => {
    admin = new PocketBase(PB_URL);
    admin.autoCancellation(false);
    await admin.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL!, PB_ADMIN_PASSWORD!);
  });

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
  afterEach(() => vi.unstubAllGlobals());

  it('signs in with a password and offers the password method', async () => {
    const email = await newUser();
    const a = createPocketBase({ url: PB_URL! });
    expect(await a.authMethods()).toContainEqual({ kind: 'password' });
    expect(a.session()).toBeNull();
    await expect(a.push([change('x', 1)])).rejects.toThrow(/Not signed in/);
    await expect(a.signIn({ kind: 'password' }, { identity: email, password: 'wrong-wrong' })).rejects.toThrow();
    expect(await a.signIn({ kind: 'password' }, { identity: email, password: PASSWORD })).toEqual({ user: email });
    expect(a.session()).toEqual({ user: email });
    await a.signOut();
    expect(a.session()).toBeNull();
  });

  it('round trips every change type and a tombstone', async () => {
    const a = await signedIn(await newUser());
    const all: SyncChange[] = [
      { type: 'flight', id: 'f1', updatedAt: 10, data: { id: 'f1', fixes: [1, 2] } },
      { type: 'manual', id: 'm1', updatedAt: 11, data: { id: 'm1' } },
      { type: 'cameraPath', id: 'c1', updatedAt: 12, data: { key: 'f1', tracks: [] } },
      { type: 'pref', id: 'unit', updatedAt: 13, data: 'metric' },
      { type: 'flight', id: 'gone', updatedAt: 14, deleted: true }
    ];
    await a.push(all);
    const { changes } = await pullAll(a);
    expect(changes).toEqual(all);
    expect('data' in changes[4]).toBe(false);
  });

  it('keeps the newer write when an older one arrives later', async () => {
    const a = await signedIn(await newUser());
    await a.push([change('f', 20, { data: { v: 'new' } })]);
    await a.push([change('f', 10, { data: { v: 'old' } })]);
    expect((await pullAll(a)).changes).toEqual([change('f', 20, { data: { v: 'new' } })]);

    await a.push([change('f', 30, { deleted: true, data: undefined })]);
    expect((await pullAll(a)).changes).toEqual([{ type: 'flight', id: 'f', updatedAt: 30, deleted: true }]);
  });

  it('hides records from other users', async () => {
    const a = await signedIn(await newUser());
    const b = await signedIn(await newUser());
    await a.push([change('secret', 1)]);
    expect((await pullAll(b)).changes).toEqual([]);

    // The same id for another owner is a separate record.
    await b.push([change('secret', 2, { data: { mine: true } })]);
    expect((await pullAll(a)).changes).toEqual([change('secret', 1)]);
  });

  it('pages through many records and resumes from the cursor', async () => {
    const a = await signedIn(await newUser(), 2);
    await a.push(Array.from({ length: 5 }, (_, i) => change(`p${i}`, i + 1)));
    const first = await a.pull(null);
    expect(first.changes).toHaveLength(2);
    expect(first.more).toBe(true);

    const { changes, cursor } = await pullAll(a);
    expect(changes.map((c) => c.id).sort()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);

    await a.push([change('p5', 9)]);
    const next = await a.pull(cursor);
    expect(next.changes.map((c) => c.id)).toEqual(['p5']);
    expect(next.more).toBe(false);
  });

  // PocketBase always stamps `updated` itself, so ties are forced in the database file. Needs PB_DB=<pb_data>/data.db.
  it.skipIf(!process.env.PB_DB)('does not skip or repeat records that share the same updated value', async () => {
    const email = await newUser();
    const a = await signedIn(email, 2);
    await a.push(Array.from({ length: 5 }, (_, i) => change(`t${i}`, i + 1)));

    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(process.env.PB_DB!);
    db.prepare('UPDATE records SET updated = ? WHERE owner = ?').run('2026-01-01 00:00:00.000Z', users.at(-1)!.id);
    db.close();

    const { changes } = await pullAll(a);
    expect(changes.map((c) => c.id).sort()).toEqual(['t0', 't1', 't2', 't3', 't4']);
  });

  it('pulls many records in small pages without skipping or repeating', async () => {
    const a = await signedIn(await newUser(), 3);
    await a.push(Array.from({ length: 10 }, (_, i) => change(`q${i}`, i + 1)));

    const ids = (await pullAll(a)).changes.map((c) => c.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
  });

  it('converges two SyncEngines through the server', async () => {
    const email = await newUser();
    const device = async () => {
      const repo = new IndexedDbFlightRepository(`db-${crypto.randomUUID()}`);
      return { repo, engine: new SyncEngine(repo, await signedIn(email), { cooldownMs: 0 }) };
    };

    const a = await device();
    const b = await device();

    await a.repo.save(flight('f1'));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(a.engine.lastError).toBeNull();
    expect((await b.repo.get('f1'))?.id).toBe('f1');

    await b.repo.delete('f1');
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(await a.repo.get('f1')).toBeUndefined();
  });

  describe('club sharing', () => {
    const club = {
      v: 1,
      pilot: 'A',
      date: '2026-07-15',
      site: null,
      glider: null,
      durationS: 60,
      freeDistanceKm: 1,
      maxAltMsl: 1000,
      maxGain: 10,
      bestClimb: 1,
      bestThermalGain: 5
    };
    const shared = (id: string, updatedAt: number, on = true): SyncChange => ({
      type: 'flight',
      id,
      updatedAt,
      data: { ...flight(id), shared: on, ...(on ? { club } : {}) }
    });

    // The server is shared by all tests, so a list is narrowed to the pilots of the test.
    const idOf = (email: string) => users.find((u) => u.email === email)!.id;
    const listOf = async (who: BackendAdapter, ...emails: string[]) =>
      (await who.club!.list()).filter((e) => emails.map(idOf).includes(e.owner));

    it('shows a shared flight to others without its track and keeps pull private', async () => {
      const ea = await newUser();
      const a = await signedIn(ea);
      const b = await signedIn(await newUser());
      await a.push([shared('s', 1), change('private', 1)]);

      const list = await listOf(b, ea);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ mine: false, owner: idOf(ea), stats: club });
      expect(Object.keys(list[0]).sort()).toEqual(['key', 'mine', 'owner', 'stats']);
      expect((await listOf(a, ea))[0]).toMatchObject({ mine: true, key: list[0].key });

      const full = (await b.club!.flight(list[0].key)) as Flight;
      expect(full.fixes).toHaveLength(1);

      // A's records must not land in B's logbook.
      expect((await pullAll(b)).changes).toEqual([]);
      expect((await pullAll(a)).changes.map((c) => c.id).sort()).toEqual(['private', 's']);
    });

    it('does not let another pilot change or delete a shared record', async () => {
      const ea = await newUser();
      const a = await signedIn(ea);
      await a.push([shared('s', 1)]);
      const key = (await listOf(a, ea))[0].key;

      const raw = new PocketBase(PB_URL);
      await raw.collection('users').authWithPassword(await newUser(), PASSWORD);
      await expect(raw.collection('records').update(key, { deleted: true })).rejects.toThrow();
      await expect(raw.collection('records').delete(key)).rejects.toThrow();
      expect(await listOf(a, ea)).toHaveLength(1);
    });

    it('hides a flight again after unshare or delete', async () => {
      const ea = await newUser();
      const a = await signedIn(ea);
      const b = await signedIn(await newUser());
      await a.push([shared('s', 1), shared('d', 1)]);
      expect(await listOf(b, ea)).toHaveLength(2);
      const key = (await listOf(b, ea))[0].key;

      await a.push([shared('s', 2, false), { type: 'flight', id: 'd', updatedAt: 2, deleted: true }]);
      expect(await listOf(b, ea)).toEqual([]);
      await expect(b.club!.flight(key)).rejects.toThrow();
    });
  });
});
