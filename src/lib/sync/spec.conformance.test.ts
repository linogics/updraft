// Checks a server against the Updraft sync HTTP spec v1 with plain fetch, so it can test any implementation.
// Runs only with SPEC_URL set to the base URL, for example SPEC_URL=http://127.0.0.1:8090.
// The server needs signup enabled, because the test creates its own accounts.
// SPEC_APP_ORIGIN is optional, set it to an origin the server allows to also check the unknown provider answer.
import { beforeAll, describe, expect, it } from 'vitest';

const { SPEC_URL, SPEC_APP_ORIGIN } = process.env;
const run = SPEC_URL ? describe : describe.skip;
const BASE = `${(SPEC_URL ?? '').replace(/\/$/, '')}/api/updraft/v1`;
const PASSWORD = 'pilot-password-1';

interface Change {
  type: string;
  id: string;
  updatedAt: number;
  deleted?: boolean;
  data?: unknown;
}
interface Flight {
  key: string;
  owner: string;
  mine: boolean;
  stats?: { km?: number };
}
// Every route answers with some of these. The tests assert which ones.
interface Body {
  message: string;
  token: string;
  user: { id: string; name: string };
  version: number;
  auth: { password: boolean; signup: boolean; oauth: { id: string; label: string }[] };
  club: boolean;
  limits: { maxChanges: number; maxPull: number };
  changes: Change[];
  cursor: string | null;
  more: boolean;
  flights: Flight[];
  data: unknown;
}
interface Res {
  status: number;
  body: Body;
}

async function call(method: string, path: string, token?: string, body?: unknown): Promise<Res> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Body };
}

// Servers may rate limit the auth routes, so wait and retry on 429.
async function authCall(path: string, body: unknown): Promise<Res> {
  for (let i = 0; i < 10; i++) {
    const r = await call('POST', path, undefined, body);
    if (r.status !== 429) return r;
    await new Promise((resolve) => setTimeout(resolve, 3200));
  }

  throw new Error('Still rate limited.');
}

// A plain GET that does not follow redirects, for the browser flow routes.
async function browserGet(path: string) {
  for (let i = 0; i < 10; i++) {
    const res = await fetch(BASE + path, { redirect: 'manual' });
    if (res.status !== 429) return res;
    await new Promise((resolve) => setTimeout(resolve, 3200));
  }

  throw new Error('Still rate limited.');
}

const change = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({
  type: 'flight',
  id,
  updatedAt,
  data: { id },
  ...extra
});

async function pullAll(token: string, limit = 1000) {
  const changes: Change[] = [];
  let cursor: string | null = null;
  for (;;) {
    const q: string = `?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`;
    const r: Res = await call('GET', `/pull${q}`, token);
    expect(r.status).toBe(200);
    changes.push(...r.body.changes);
    cursor = r.body.cursor;
    if (!r.body.more) return { changes, cursor };
  }
}

run('sync spec v1', { timeout: 60000 }, () => {
  let caps: Body;
  let a: { token: string; id: string; email: string };
  let b: { token: string; id: string };

  const signup = async () => {
    const email = `pilot-${crypto.randomUUID()}@test.local`;
    const r = await authCall('/auth/signup', { email, password: PASSWORD });
    expect(r.status).toBe(200);
    return { token: r.body.token, id: r.body.user.id, email };
  };

  beforeAll(async () => {
    caps = (await call('GET', '')).body;
    // Without signup the test has no way to get accounts.
    if (!caps.auth?.signup) throw new Error('The server must have signup enabled (UPDRAFT_SIGNUP=true).');
    a = await signup();
    b = await signup();
  });

  it('describes its capabilities', () => {
    expect(caps.version).toBe(1);
    expect(caps.auth.password).toBe(true);
    expect(Array.isArray(caps.auth.oauth)).toBe(true);
    expect(typeof caps.club).toBe('boolean');
    expect(caps.limits.maxChanges).toBeGreaterThan(0);
    expect(caps.limits.maxPull).toBeGreaterThan(0);
  });

  it('refuses the oauth redirect for an origin that is not allowed', async () => {
    const res = await browserGet('/auth/redirect/any?origin=https://not-allowed.invalid');
    expect(res.status).toBe(400);
    expect((await browserGet('/auth/redirect/any')).status).toBe(400);
  });

  it.runIf(SPEC_APP_ORIGIN)('answers 404 for an unknown oauth provider', async () => {
    const res = await browserGet(`/auth/redirect/no-such-provider?origin=${encodeURIComponent(SPEC_APP_ORIGIN ?? '')}`);
    expect(res.status).toBe(404);
  });

  it('refuses the oauth callback without the cookie of a started sign in', async () => {
    const res = await browserGet('/auth/callback?code=abc&state=def');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).not.toContain('postMessage');
  });

  it('signs in with a password and rejects a wrong one', async () => {
    const ok = await authCall('/auth/password', { identity: a.email, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
    expect(ok.body.user).toEqual({ id: a.id, name: a.email });
    const bad = await authCall('/auth/password', { identity: a.email, password: 'nope-nope-1' });
    expect(bad.status).toBe(401);
    expect(typeof bad.body.message).toBe('string');
  });

  it('rejects a short password on signup', async () => {
    const r = await authCall('/auth/signup', { email: `x-${crypto.randomUUID()}@test.local`, password: 'short' });
    expect(r.status).toBe(400);
  });

  it('requires a token', async () => {
    for (const [m, p] of [
      ['POST', '/push'],
      ['GET', '/pull'],
      ['GET', '/club'],
      ['GET', '/club/abc']
    ]) {
      expect((await call(m, p, undefined, m === 'POST' ? { changes: [] } : undefined)).status).toBe(401);
    }

    expect((await call('GET', '/pull', 'not-a-token')).status).toBe(401);
  });

  it('round trips a push and a pull', async () => {
    const r = await call('POST', '/push', a.token, {
      changes: [
        change('rt1', 10, { data: { id: 'rt1', n: 1 } }),
        { type: 'pref', id: 'rt-pref', updatedAt: 11, data: 5 }
      ]
    });
    expect(r.status).toBe(200);
    const { changes } = await pullAll(a.token);
    expect(changes).toContainEqual({ type: 'flight', id: 'rt1', updatedAt: 10, data: { id: 'rt1', n: 1 } });
    expect(changes).toContainEqual({ type: 'pref', id: 'rt-pref', updatedAt: 11, data: 5 });
  });

  it('keeps the newer write and ignores an older one', async () => {
    await call('POST', '/push', a.token, { changes: [change('lww', 20, { data: { v: 'new' } })] });
    await call('POST', '/push', a.token, { changes: [change('lww', 19, { data: { v: 'old' } })] });
    const row = (await pullAll(a.token)).changes.find((c) => c.id === 'lww');
    expect(row).toEqual({ type: 'flight', id: 'lww', updatedAt: 20, data: { v: 'new' } });
    await call('POST', '/push', a.token, { changes: [change('lww', 21, { data: { v: 'newer' } })] });
    expect((await pullAll(a.token)).changes.find((c) => c.id === 'lww')?.data).toEqual({ v: 'newer' });
  });

  it('returns deletes without data', async () => {
    await call('POST', '/push', a.token, { changes: [change('del', 30)] });
    await call('POST', '/push', a.token, { changes: [{ type: 'flight', id: 'del', updatedAt: 31, deleted: true }] });
    const row = (await pullAll(a.token)).changes.find((c) => c.id === 'del');
    expect(row).toEqual({ type: 'flight', id: 'del', updatedAt: 31, deleted: true });
  });

  it('pages with limit and cursor', async () => {
    const u = await signup();
    const changes = Array.from({ length: 5 }, (_, i) => change(`pg${i}`, 100 + i));
    expect((await call('POST', '/push', u.token, { changes })).status).toBe(200);

    const empty = await call('GET', '/pull?cursor=', u.token);
    expect(empty.body.changes).toHaveLength(5);

    const p1 = await call('GET', '/pull?limit=2', u.token);
    expect(p1.body.changes.map((c) => c.id)).toEqual(['pg0', 'pg1']);
    expect(p1.body.more).toBe(true);
    expect(typeof p1.body.cursor).toBe('string');

    const p2 = await call('GET', `/pull?limit=2&cursor=${p1.body.cursor}`, u.token);
    expect(p2.body.changes.map((c) => c.id)).toEqual(['pg2', 'pg3']);

    const p3 = await call('GET', `/pull?limit=2&cursor=${p2.body.cursor}`, u.token);
    expect(p3.body.changes.map((c) => c.id)).toEqual(['pg4']);
    expect(p3.body.more).toBe(false);

    // An empty page keeps the cursor it was given.
    const p4 = await call('GET', `/pull?cursor=${p3.body.cursor}`, u.token);
    expect(p4.body).toEqual({ changes: [], cursor: p3.body.cursor, more: false });
    const fresh = await signup();
    expect((await call('GET', '/pull', fresh.token)).body).toEqual({ changes: [], cursor: null, more: false });
  });

  it('rejects bad pull parameters', async () => {
    expect((await call('GET', '/pull?cursor=abc', a.token)).status).toBe(400);
    expect((await call('GET', '/pull?limit=0', a.token)).status).toBe(400);
    expect((await call('GET', '/pull?limit=abc', a.token)).status).toBe(400);
    expect((await call('GET', `/pull?limit=${caps.limits.maxPull + 1}`, a.token)).status).toBe(400);
  });

  it('only returns own records', async () => {
    await call('POST', '/push', a.token, { changes: [change('only-a', 40)] });
    expect((await pullAll(b.token)).changes.find((c) => c.id === 'only-a')).toBeUndefined();
  });

  it('rejects invalid changes', async () => {
    const bad: unknown[] = [
      { type: 'nope', id: 'x', updatedAt: 1 },
      { type: 'flight', id: '', updatedAt: 1 },
      { type: 'flight', id: 'x'.repeat(201), updatedAt: 1 },
      { type: 'flight', id: 'x', updatedAt: 'now' },
      { type: 'flight', id: 'x', updatedAt: 1, deleted: 'yes' },
      null
    ];
    for (const c of bad) expect((await call('POST', '/push', a.token, { changes: [c] })).status).toBe(400);
    expect((await call('POST', '/push', a.token, {})).status).toBe(400);
    expect((await call('POST', '/push', a.token, { changes: 'x' })).status).toBe(400);
  });

  it('rejects too many changes', async () => {
    const changes = Array.from({ length: caps.limits.maxChanges + 1 }, (_, i) => change(`many${i}`, 1));
    expect((await call('POST', '/push', a.token, { changes })).status).toBe(400);
  });

  it('serves the club', async () => {
    if (!caps.club) return;
    const shared = { id: 'sh1', shared: true, club: { km: 12 }, secret: 'track' };
    await call('POST', '/push', a.token, { changes: [change('sh1', 50, { data: shared })] });

    const list = await call('GET', '/club', b.token);
    expect(list.status).toBe(200);
    const mine = list.body.flights.find((f) => f.owner === a.id && f.stats?.km === 12);
    if (!mine) throw new Error('The shared flight is missing from the list.');
    expect(mine.mine).toBe(false);
    expect(mine).not.toHaveProperty('data');
    expect(list.body.flights.every((f) => !('data' in f))).toBe(true);
    expect((await call('GET', '/club', a.token)).body.flights.find((f) => f.key === mine.key)?.mine).toBe(true);

    const one = await call('GET', `/club/${mine.key}`, b.token);
    expect(one.status).toBe(200);
    expect(one.body.data).toEqual(shared);
    expect((await call('GET', '/club/does-not-exist', b.token)).status).toBe(404);

    // Unsharing makes the same key unknown.
    await call('POST', '/push', a.token, { changes: [change('sh1', 52, { data: { id: 'sh1', shared: false } })] });
    expect((await call('GET', `/club/${mine.key}`, b.token)).status).toBe(404);
  });
});
