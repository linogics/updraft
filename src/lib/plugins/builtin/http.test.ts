import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncChange } from '#lib/sync/types';

import { createHttp } from './http';

const URL = 'http://localhost:8090';
const KEY = `updraft_http_auth:${URL}`;
const API = `${URL}/api/updraft/v1`;
const CAPS = {
  version: 1,
  auth: { password: true, signup: false, oauth: [{ id: 'google', label: 'Google' }] },
  club: true
};

const change = (id: string, data: unknown = null): SyncChange => ({ type: 'pref', id, updatedAt: 1, data });
const many = (n: number) => Array.from({ length: n }, (_, i) => change(`c${i}`));

let store: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;
type Call = [string, { body?: string; headers: Record<string, string> }];
const calls = () => fetchMock.mock.calls as Call[];
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const signedIn = () => store.set(KEY, JSON.stringify({ token: 'tok', user: 'pilot@test.local' }));
const sentChunks = () =>
  calls()
    .filter((c) => c[0].endsWith('/push'))
    .map((c) => (JSON.parse(c[1].body ?? '') as { changes: SyncChange[] }).changes);

beforeEach(() => {
  store = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  });
  fetchMock = vi.fn(async (url: string) => (url === API ? reply(CAPS) : reply({}, 404)));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('http sign in', () => {
  it('signs in with a password and stores the token for later calls', async () => {
    fetchMock.mockResolvedValueOnce(reply({ token: 'tok', user: { id: 'u1', name: 'pilot@test.local' } }));
    const a = createHttp({ url: URL });

    expect(await a.signIn({ kind: 'password' }, { identity: 'pilot@test.local', password: 'pw' })).toEqual({
      user: 'pilot@test.local'
    });
    expect(JSON.parse(calls()[0][1].body ?? '')).toEqual({ identity: 'pilot@test.local', password: 'pw' });
    expect(a.session()).toEqual({ user: 'pilot@test.local' });
    expect(JSON.parse(store.get(KEY) ?? '')).toEqual({ token: 'tok', user: 'pilot@test.local' });

    fetchMock.mockResolvedValueOnce(reply({ changes: [], cursor: null, more: false }));
    await a.pull(null);
    expect(calls()[1][1].headers.authorization).toBe('Bearer tok');
  });

  it('shows the server message for a wrong password', async () => {
    fetchMock.mockResolvedValueOnce(reply({ message: 'Wrong email or password.' }, 401));

    await expect(
      createHttp({ url: URL }).signIn({ kind: 'password' }, { identity: 'a', password: 'b' })
    ).rejects.toThrow('Wrong email or password.');
  });

  it('forgets the session on sign out and keeps servers apart', async () => {
    signedIn();
    const a = createHttp({ url: URL });
    expect(a.session()).toEqual({ user: 'pilot@test.local' });
    expect(createHttp({ url: 'http://localhost:9999' }).session()).toBeNull();

    await a.signOut();
    expect(a.session()).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it('maps the capabilities to auth methods and asks once', async () => {
    const a = createHttp({ url: URL });

    expect(await a.authMethods()).toEqual([{ kind: 'password' }, { kind: 'redirect', id: 'google', label: 'Google' }]);
    await a.authMethods();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports an outdated server when the capabilities route is missing', async () => {
    fetchMock.mockResolvedValue(reply({ message: 'no' }, 404));

    await expect(createHttp({ url: URL }).authMethods()).rejects.toThrow('kit is outdated');
  });
});

describe('http sync', () => {
  it('clears the session and asks for a new sign in on 401', async () => {
    signedIn();
    fetchMock.mockResolvedValue(reply({ message: 'bad token' }, 401));
    const a = createHttp({ url: URL });

    await expect(a.push(many(1))).rejects.toThrow('Signed out, sign in again.');
    expect(a.session()).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it('requires a signed in user', async () => {
    await expect(createHttp({ url: URL }).push(many(1))).rejects.toThrow('Not signed in.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('splits 450 small changes into 200, 200 and 50', async () => {
    signedIn();
    fetchMock.mockResolvedValue(reply({}));
    const all = many(450);
    await createHttp({ url: URL }).push(all);

    expect(sentChunks().map((c) => c.length)).toEqual([200, 200, 50]);
    expect(sentChunks().flat()).toEqual(all);
  });

  it('starts a new chunk before 16 MiB and sends a huge change alone', async () => {
    signedIn();
    fetchMock.mockResolvedValue(reply({}));
    const big = (id: string, mb: number) => change(id, 'x'.repeat(mb * 1024 * 1024));
    await createHttp({ url: URL }).push([big('a', 6), big('b', 6), big('c', 6), big('huge', 17), change('d')]);

    expect(sentChunks().map((c) => c.map((x) => x.id))).toEqual([['a', 'b'], ['c'], ['huge'], ['d']]);
  });

  it('pulls a page, skips bad rows and passes the cursor on', async () => {
    signedIn();
    fetchMock.mockResolvedValue(
      reply({
        changes: [
          { type: 'flight', id: 'f1', updatedAt: 5, data: { id: 'f1' } },
          { type: 'nope', id: 'x', updatedAt: 1 },
          { type: 'flight', id: 7, updatedAt: 1 },
          { type: 'manual', id: 'm1', updatedAt: 6, deleted: true, data: 'ignored' }
        ],
        cursor: '12',
        more: true
      })
    );

    const page = await createHttp({ url: URL }).pull('10');
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${API}/pull?limit=200&cursor=10`);
    expect(page).toEqual({
      changes: [
        { type: 'flight', id: 'f1', updatedAt: 5, data: { id: 'f1' } },
        { type: 'manual', id: 'm1', updatedAt: 6, deleted: true }
      ],
      cursor: '12',
      more: true
    });
  });

  it('rejects a pull answer of the wrong shape', async () => {
    signedIn();
    fetchMock.mockResolvedValue(reply({ changes: 'x', cursor: null }));

    await expect(createHttp({ url: URL }).pull(null)).rejects.toThrow('invalid pull answer');
  });
});

describe('http club', () => {
  it('is absent until the server offers it', async () => {
    signedIn();
    fetchMock.mockResolvedValue(reply({ ...CAPS, club: false }));
    const a = createHttp({ url: URL });
    await a.authMethods();

    expect(a.club).toBeUndefined();
  });

  it('lists and opens shared flights when offered', async () => {
    signedIn();
    const a = createHttp({ url: URL });
    expect(a.club).toBeUndefined();
    await a.authMethods();

    fetchMock.mockResolvedValueOnce(
      reply({ flights: [{ key: 'k1', owner: 'u2', mine: false, stats: { km: 1 } }, { key: 3 }] })
    );
    expect(await a.club?.list()).toEqual([{ key: 'k1', owner: 'u2', mine: false, stats: { km: 1 } }]);

    fetchMock.mockResolvedValueOnce(reply({ data: { id: 'f' } }));
    expect(await a.club?.flight('k/1')).toEqual({ id: 'f' });
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).toBe(`${API}/club/k%2F1`);
  });
});

describe('http oauth', () => {
  const google = { kind: 'redirect', id: 'google', label: 'Google' } as const;
  let open: ReturnType<typeof vi.fn>;
  let sender: BroadcastChannel;

  beforeEach(() => {
    open = vi.fn(() => ({}));
    vi.stubGlobal('window', { open });
    vi.stubGlobal('location', { origin: 'http://localhost:5173' });
    sender = new BroadcastChannel('updraft-auth');
  });
  afterEach(() => sender.close());

  const stateOf = () => new globalThis.URL(open.mock.calls[0][0] as string).searchParams.get('app_state');
  const tick = () => new Promise((r) => setTimeout(r, 20));

  it('throws when the browser blocks the popup', async () => {
    open.mockReturnValue(null);

    await expect(createHttp({ url: URL }).signIn(google)).rejects.toThrow('blocked the sign in window');
  });

  it('opens the popup before any await with origin and app_state', async () => {
    const p = createHttp({ url: URL }).signIn(google);
    p.catch(() => {});

    const u = new globalThis.URL(open.mock.calls[0][0] as string);
    expect(u.origin + u.pathname).toBe(`${API}/auth/redirect/google`);
    expect(u.searchParams.get('origin')).toBe('http://localhost:5173');
    expect(stateOf()).toMatch(/^[A-Za-z0-9_-]{22,}$/);
  });

  it('ignores a result with another state and accepts the matching one', async () => {
    const a = createHttp({ url: URL });
    const p = a.signIn(google);
    const state = stateOf();
    let settled = false;
    void p.then(
      () => (settled = true),
      () => (settled = true)
    );

    sender.postMessage({ type: 'updraft-auth', state: 'other', token: 'evil', user: { id: 'x', name: 'evil' } });
    sender.postMessage({ type: 'other', state, token: 'evil', user: { id: 'x', name: 'evil' } });
    await tick();
    expect(settled).toBe(false);
    expect(a.session()).toBeNull();

    sender.postMessage({ type: 'updraft-auth', state, token: 'tok', user: { id: 'u1', name: 'pilot@test.local' } });
    expect(await p).toEqual({ user: 'pilot@test.local' });
    expect(JSON.parse(store.get(KEY) ?? '')).toEqual({ token: 'tok', user: 'pilot@test.local' });
  });

  it('rejects with the error of the server', async () => {
    const p = createHttp({ url: URL }).signIn(google);
    sender.postMessage({ type: 'updraft-auth', state: stateOf(), error: 'No account matches your Google email.' });

    await expect(p).rejects.toThrow('No account matches your Google email.');
  });

  it('gives up after five minutes', async () => {
    vi.useFakeTimers();
    const p = createHttp({ url: URL }).signIn(google);
    const outcome = p.then(
      () => 'resolved',
      (e: Error) => e.message
    );
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

    expect(await outcome).toBe('Sign in was cancelled.');
  });
});
