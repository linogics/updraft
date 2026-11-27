// The contract suite of the sync HTTP spec v2. It talks to a server with plain fetch and checks every JSON answer
// against the response schema of docs/server/openapi.yaml, so it works with any implementation.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, type TestContext } from 'vitest';
import { parse } from 'yaml';

import type { JsonSchema } from '#lib/plugins/api';
import { validate } from '#lib/plugins/schema';

export interface ContractEnv {
  /** Server address without the base path. */
  url: string;
  /** An account the suite may write to. */
  token: string;
  /** A second account, enables the isolation and club tests. */
  token2?: string;
  /** A club id both accounts belong to. */
  club?: string;
}

interface Item {
  id: string;
  version: string;
  deleted: boolean;
  data?: Record<string, unknown>;
  times?: Record<string, number>;
  secret?: boolean;
}
interface Page<T> {
  items: T[];
  cursor: string | null;
  more: boolean;
}
interface ClubFlight {
  key: string;
  owner: string;
  mine: boolean;
  deleted: boolean;
  hasTrack: boolean;
  summary?: { tag?: string; km?: number } | null;
}
interface Caps {
  version: number;
  clubs: boolean;
  limits: { maxPage: number; maxItemBytes: number; maxTrackBytes: number };
}
interface Res<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  bytes: Uint8Array;
}
interface CallOptions {
  params?: Record<string, string>;
  query?: Record<string, string>;
  /** `null` sends no token. Defaults to the first account. */
  token?: string | null;
  headers?: Record<string, string>;
  json?: unknown;
  raw?: Uint8Array;
}

type Schema = JsonSchema & { $ref?: string };
interface Spec {
  paths: Record<string, Record<string, { responses: Record<string, unknown> }>>;
  components: { schemas: Record<string, JsonSchema>; responses: Record<string, unknown> };
}

// The validator knows `#/$defs/` only, so the spec refs are rewritten once.
const spec = JSON.parse(
  JSON.stringify(parse(readFileSync(join(process.cwd(), 'docs/server/openapi.yaml'), 'utf8'))).replaceAll(
    '#/components/schemas/',
    '#/$defs/'
  )
) as Spec;
const defs = spec.components.schemas;

function responseSchema(template: string, method: string, status: number): Schema | undefined {
  const responses = spec.paths[template]?.[method.toLowerCase()]?.responses;
  let r = responses?.[String(status)] as { $ref?: string; content?: Record<string, { schema?: Schema }> } | undefined;
  if (!r) throw new Error(`${method} ${template} answered ${status}, which the spec does not list`);

  if (r.$ref) r = spec.components.responses[r.$ref.split('/').pop() ?? ''] as typeof r;
  return r?.content?.['application/json']?.schema;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const quoted = (v: string) => `"${v}"`;

export function contractSuite(env: ContractEnv) {
  // Read lazily, a caller may fill the url after the suite is registered.
  const base = () => `${env.url.replace(/\/$/, '')}/api/updraft/v2`;
  const prefix = `contract-${Math.random().toString(36).slice(2, 10)}`;
  const written: { token: string; collection: string; id: string }[] = [];
  let caps = { limits: { maxPage: 100, maxItemBytes: 0, maxTrackBytes: 0 } } as Caps;
  let n = 0;

  const newId = () => `${prefix}-${++n}`;

  // Servers may rate limit, so wait and try again on 429.
  async function call<T = unknown>(method: string, template: string, o: CallOptions = {}): Promise<Res<T>> {
    let path = template;
    for (const [k, v] of Object.entries(o.params ?? {})) path = path.replace(`{${k}}`, encodeURIComponent(v));

    const query = new URLSearchParams(o.query).toString();
    const headers: Record<string, string> = { ...o.headers };
    const token = o.token === undefined ? env.token : o.token;
    if (token) headers.authorization = `Bearer ${token}`;
    if (o.json !== undefined) headers['content-type'] = 'application/json';

    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${base()}${path === '/' ? '' : path}${query ? `?${query}` : ''}`, {
        method,
        headers,
        body: o.json === undefined ? (o.raw as BodyInit | undefined) : JSON.stringify(o.json)
      });

      if (res.status === 429 && attempt < 30) {
        await sleep(Math.min(Number(res.headers.get('retry-after') ?? 1), 10) * 1000);
        continue;
      }

      const bytes = new Uint8Array(await res.arrayBuffer());
      const isJson = (res.headers.get('content-type') ?? '').includes('json');
      const body = isJson ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : (undefined as T);

      const schema = responseSchema(template, method, res.status);
      if (isJson && schema) {
        expect(validate(schema, body, defs, `${method} ${template} ${res.status}`)).toBeNull();
      }

      return { status: res.status, headers: res.headers, body, bytes };
    }
  }

  const list = (collection: string, since?: string, limit?: number, token?: string) =>
    call<Page<Item>>('GET', '/{collection}', {
      params: { collection },
      query: { ...(since === undefined ? {} : { since }), ...(limit === undefined ? {} : { limit: String(limit) }) },
      token
    });

  async function put(
    collection: string,
    id: string,
    data: object,
    times: object,
    version?: string,
    extra = {},
    token?: string
  ) {
    written.push({ token: token ?? env.token, collection, id });
    return call<Item>('PUT', '/{collection}/{id}', {
      params: { collection, id },
      headers: version === undefined ? { 'if-none-match': '*' } : { 'if-match': quoted(version) },
      json: { data, times, ...extra },
      token
    });
  }

  const del = (collection: string, id: string, version: string, token?: string) =>
    call('DELETE', '/{collection}/{id}', {
      params: { collection, id },
      headers: { 'if-match': quoted(version) },
      token
    });

  // The cursor after everything that is there now, so a test sees only its own changes.
  async function endCursor(collection: string): Promise<string | undefined> {
    let since: string | undefined;
    for (;;) {
      const r = await list(collection, since);
      if (r.body.cursor !== null) since = r.body.cursor;
      if (!r.body.more) return since;
    }
  }

  async function changesSince(collection: string, since: string | undefined, token?: string) {
    const out: Item[] = [];
    for (;;) {
      const r = await list(collection, since, 2, token);
      out.push(...r.body.items.filter((i) => i.id.startsWith(prefix)));
      if (!r.body.more) return out;
      since = r.body.cursor ?? undefined;
    }
  }

  const bytesOf = (s: string) => new TextEncoder().encode(s);
  const needClubs = (ctx: TestContext) => {
    if (!caps.clubs || !env.token2 || !env.club) ctx.skip();
  };

  beforeAll(async () => {
    caps = (await call<Caps>('GET', '/', { token: null })).body;
  });

  afterAll(async () => {
    // Tombstones stay on the server, there is no way to purge them.
    for (const w of written) {
      const cur = await call<Item>('GET', '/{collection}/{id}', {
        params: { collection: w.collection, id: w.id },
        token: w.token
      });
      if (cur.status === 200 && !cur.body.deleted) await del(w.collection, w.id, cur.body.version, w.token);
    }
  });

  describe('capabilities and auth', () => {
    it('answers capabilities without a token', () => {
      expect(caps.version).toBe(2);
      expect(caps.limits.maxPage).toBeGreaterThanOrEqual(1);
    });

    it('answers 401 without a token', async () => {
      expect((await call('GET', '/{collection}', { params: { collection: 'flights' }, token: null })).status).toBe(401);
      const r = await call('PUT', '/{collection}/{id}', {
        params: { collection: 'flights', id: newId() },
        headers: { 'if-none-match': '*' },
        json: { data: {}, times: {} },
        token: null
      });
      expect(r.status).toBe(401);
    });
  });

  describe('items', () => {
    it('creates, reads, updates and checks preconditions', async () => {
      const id = newId();
      const noCondition = await call('PUT', '/{collection}/{id}', {
        params: { collection: 'flights', id },
        json: { data: {}, times: {} }
      });
      expect(noCondition.status).toBe(428);

      const created = await put('flights', id, { name: 'a' }, { name: 1 });
      expect(created.status).toBe(200);
      expect(created.headers.get('etag')).toBe(quoted(created.body.version));
      expect(created.body).toMatchObject({ id, deleted: false, data: { name: 'a' }, times: { name: 1 } });

      const read = await call<Item>('GET', '/{collection}/{id}', { params: { collection: 'flights', id } });
      expect(read.body).toEqual(created.body);

      const again = await put('flights', id, { name: 'b' }, { name: 2 });
      expect(again.status).toBe(412);
      expect(again.body).toEqual(created.body);

      const updated = await put('flights', id, { name: 'b' }, { name: 2 }, created.body.version);
      expect(updated.status).toBe(200);
      expect(updated.body.version).not.toBe(created.body.version);

      const stale = await put('flights', id, { name: 'c' }, { name: 3 }, created.body.version);
      expect(stale.status).toBe(412);
      expect(stale.body).toEqual(updated.body);
    });

    it('answers 404 for unknown items', async () => {
      const id = newId();
      expect((await call('GET', '/{collection}/{id}', { params: { collection: 'flights', id } })).status).toBe(404);
      expect((await put('flights', id, {}, {}, 'nope')).status).toBe(404);
      expect((await del('flights', id, 'nope')).status).toBe(404);
    });

    it('keeps a tombstone and revives it', async () => {
      const id = newId();
      const created = await put('flights', id, { a: 1 }, { a: 1 });
      expect((await del('flights', id, 'stale')).status).toBe(412);
      expect((await call('DELETE', '/{collection}/{id}', { params: { collection: 'flights', id } })).status).toBe(428);
      expect((await del('flights', id, created.body.version)).status).toBe(204);

      const tomb = await call<Item>('GET', '/{collection}/{id}', { params: { collection: 'flights', id } });
      expect(tomb.status).toBe(200);
      expect(tomb.body).toMatchObject({ id, deleted: true });
      expect(tomb.body.data).toBeUndefined();
      expect(tomb.body.version).not.toBe(created.body.version);

      const revived = await put('flights', id, { a: 2 }, { a: 2 }, tomb.body.version);
      expect(revived.status).toBe(200);
      expect(revived.body).toMatchObject({ deleted: false, data: { a: 2 } });
    });

    it('stores camera paths and prefs, and the secret flag', async () => {
      const path = await put('camera-paths', newId(), { points: [] }, { points: 1 });
      expect(path.status).toBe(200);

      const plain = await put('prefs', newId(), { value: 1 }, { value: 1 });
      expect(plain.body.secret ?? false).toBe(false);

      const secret = await put('prefs', newId(), { value: 'key' }, { value: 1 }, undefined, { secret: true });
      expect(secret.body.secret).toBe(true);

      const read = await call<Item>('GET', '/{collection}/{id}', {
        params: { collection: 'prefs', id: secret.body.id }
      });
      expect(read.body.secret).toBe(true);
    });

    it('answers 413 for a body over the limit', async (ctx) => {
      if (caps.limits.maxItemBytes > 10_000_000) ctx.skip();

      const r = await put('flights', newId(), { pad: 'x'.repeat(caps.limits.maxItemBytes + 1) }, {});
      expect(r.status).toBe(413);
    });

    it('keeps the items of each account apart', async (ctx) => {
      if (!env.token2) ctx.skip();

      const id = newId();
      await put('flights', id, {}, {});
      const other = await call('GET', '/{collection}/{id}', {
        params: { collection: 'flights', id },
        token: env.token2
      });
      expect(other.status).toBe(404);
    });
  });

  describe('feed', () => {
    it('lists changes in order and pages with a cursor', async () => {
      const start = await endCursor('flights');
      const [a, b, c] = [newId(), newId(), newId()];
      const ra = await put('flights', a, { n: 1 }, { n: 1 });
      await put('flights', b, { n: 2 }, { n: 1 });
      await put('flights', c, { n: 3 }, { n: 1 });

      const first = await list('flights', start, 2);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.more).toBe(true);
      expect(first.body.items.map((i) => i.id)).toEqual([a, b]);

      expect((await changesSince('flights', start)).map((i) => i.id)).toEqual([a, b, c]);

      const mid = await endCursor('flights');
      await put('flights', a, { n: 9 }, { n: 2 }, ra.body.version);
      const rb = await call<Item>('GET', '/{collection}/{id}', { params: { collection: 'flights', id: b } });
      await del('flights', b, rb.body.version);

      const changes = await changesSince('flights', mid);
      expect(changes.map((i) => [i.id, i.deleted])).toEqual([
        [a, false],
        [b, true]
      ]);
      expect(changes[1].data).toBeUndefined();
    });

    it('returns the sent cursor on an empty page', async () => {
      const end = await endCursor('flights');
      const r = await list('flights', end);
      expect(r.body).toEqual({ items: [], cursor: end ?? null, more: false });
    });

    it('answers 400 for a bad or unknown cursor and a bad limit', async () => {
      expect((await list('flights', 'contract~unknown~cursor')).status).toBe(400);
      expect((await list('flights', undefined, 0)).status).toBe(400);
      expect((await list('flights', undefined, caps.limits.maxPage + 1)).status).toBe(400);
      expect(
        (await call('GET', '/{collection}', { params: { collection: 'flights' }, query: { limit: 'many' } })).status
      ).toBe(400);
    });
  });

  describe('tracks', () => {
    const track = (id: string, kind: string, token?: string) =>
      call(`GET`, `/flights/{id}/${kind}`, { params: { id }, token });
    const upload = (
      id: string,
      kind: string,
      raw: Uint8Array,
      type: string,
      headers: Record<string, string> = { 'if-none-match': '*' }
    ) => call('PUT', `/flights/{id}/${kind}`, { params: { id }, headers: { 'content-type': type, ...headers }, raw });

    it('stores each track once and serves it back', async () => {
      const id = newId();
      expect((await upload(id, 'track', bytesOf('x'), 'text/plain')).status).toBe(404);

      await put('flights', id, { hasTrack: true }, { hasTrack: 1 });
      expect((await track(id, 'track')).status).toBe(404);
      expect((await track(id, 'track.json')).status).toBe(404);
      expect((await upload(id, 'track', bytesOf('x'), 'text/plain', {})).status).toBe(428);

      const igc = bytesOf('AXXX igc file\r\nB1101355206343N00006198WA0058700558');
      expect((await upload(id, 'track', igc, 'application/x-igc')).status).toBe(201);

      const back = await track(id, 'track');
      expect(back.status).toBe(200);
      expect(back.headers.get('content-type')).toContain('application/x-igc');
      expect(back.bytes).toEqual(igc);
      expect((await upload(id, 'track', bytesOf('other'), 'application/x-igc')).status).toBe(412);

      const parsed = { fixes: [{ t: 1, lat: 46.5, lon: 8.1, alt: 1200 }] };
      const sent = await upload(id, 'track.json', bytesOf(JSON.stringify(parsed)), 'application/json');
      expect(sent.status).toBe(201);
      expect((await track(id, 'track.json')).body).toEqual(parsed);
      expect((await upload(id, 'track.json', bytesOf('{"fixes":[]}'), 'application/json')).status).toBe(412);
    });

    it('answers 413 for a track over the limit', async (ctx) => {
      if (caps.limits.maxTrackBytes > 20_000_000) ctx.skip();

      const id = newId();
      await put('flights', id, {}, {});
      const r = await upload(id, 'track', new Uint8Array(caps.limits.maxTrackBytes + 1), 'application/octet-stream');
      expect(r.status).toBe(413);
    });

    it('deletes the tracks with the flight and refuses uploads to it', async () => {
      const id = newId();
      const created = await put('flights', id, { hasTrack: true }, {});
      await upload(id, 'track', bytesOf('x'), 'text/plain');
      await upload(id, 'track.json', bytesOf('{"fixes":[]}'), 'application/json');
      await del('flights', id, created.body.version);

      expect((await track(id, 'track')).status).toBe(404);
      expect((await track(id, 'track.json')).status).toBe(404);
      expect((await upload(id, 'track', bytesOf('x'), 'text/plain')).status).toBe(404);
    });

    it('hides tracks from other accounts', async (ctx) => {
      if (!env.token2) ctx.skip();

      const id = newId();
      await put('flights', id, {}, {});
      await upload(id, 'track', bytesOf('x'), 'text/plain');
      expect((await track(id, 'track', env.token2)).status).toBe(404);
    });
  });

  describe('clubs', () => {
    const feed = async (club: string, since?: string, token?: string) => {
      const out: ClubFlight[] = [];
      let cursor = since;
      for (;;) {
        const r = await call<Page<ClubFlight>>('GET', '/clubs/{clubId}/flights', {
          params: { clubId: club },
          query: cursor === undefined ? {} : { since: cursor },
          token
        });
        out.push(...r.body.items);
        if (r.body.cursor !== null) cursor = r.body.cursor;
        if (!r.body.more) return { items: out, cursor };
      }
    };

    const clubTrack = (key: string, kind: string, token?: string) =>
      call('GET', `/clubs/{clubId}/flights/{key}/${kind}`, { params: { clubId: env.club ?? '', key }, token });

    it('lists the clubs of the pilot', async (ctx) => {
      needClubs(ctx);

      for (const token of [env.token, env.token2]) {
        const r = await call<{ clubs: { id: string }[] }>('GET', '/clubs', { token });
        expect(r.body.clubs.map((c) => c.id)).toContain(env.club);
      }
    });

    it('answers 404 for an unknown club', async (ctx) => {
      needClubs(ctx);

      const r = await call('GET', '/clubs/{clubId}/flights', { params: { clubId: `${prefix}-nope` } });
      expect(r.status).toBe(404);
      expect(
        (await call('GET', '/clubs/{clubId}/flights/{key}/track', { params: { clubId: `${prefix}-nope`, key: 'k' } }))
          .status
      ).toBe(404);
    });

    it('shows a shared flight to the other member and an unshare as deleted', async (ctx) => {
      needClubs(ctx);

      const club = env.club ?? '';
      const start = (await feed(club)).cursor;
      const id = newId();
      const tag = `${prefix}-tag`;
      const shared = await put(
        'flights',
        id,
        { hasTrack: true, clubs: [club], club: { km: 12, tag } },
        { clubs: 1 },
        undefined,
        {},
        env.token2
      );
      expect(shared.status).toBe(200);
      await call('PUT', '/flights/{id}/track', {
        params: { id },
        headers: { 'if-none-match': '*', 'content-type': 'text/plain' },
        raw: bytesOf('igc'),
        token: env.token2
      });
      await call('PUT', '/flights/{id}/track.json', {
        params: { id },
        headers: { 'if-none-match': '*', 'content-type': 'application/json' },
        raw: bytesOf('{"fixes":[]}'),
        token: env.token2
      });

      const seen = (await feed(club, start)).items.find((f) => f.summary?.tag === tag);
      expect(seen).toMatchObject({ mine: false, deleted: false, hasTrack: true, summary: { km: 12 } });
      expect(seen?.key).not.toBe(id);

      const own = (await feed(club, start, env.token2)).items.find((f) => f.key === seen?.key);
      expect(own?.mine).toBe(true);
      expect(own?.owner).toBe(seen?.owner);

      const key = seen?.key ?? '';
      const file = await clubTrack(key, 'track');
      expect(file.status).toBe(200);
      expect(new TextDecoder().decode(file.bytes)).toBe('igc');
      expect((await clubTrack(key, 'track.json')).status).toBe(200);
      expect((await clubTrack(`${prefix}-nokey`, 'track')).status).toBe(404);

      const mid = (await feed(club)).cursor;
      const unshared = await put(
        'flights',
        id,
        { hasTrack: true, clubs: [], club: { km: 12, tag } },
        { clubs: 2 },
        shared.body.version,
        {},
        env.token2
      );
      expect(unshared.status).toBe(200);

      const gone = (await feed(club, mid)).items.find((f) => f.key === key);
      expect(gone?.deleted).toBe(true);
      expect((await clubTrack(key, 'track')).status).toBe(404);
      expect((await clubTrack(key, 'track.json')).status).toBe(404);
    });

    it('shows a deleted flight as deleted', async (ctx) => {
      needClubs(ctx);

      const club = env.club ?? '';
      const start = (await feed(club)).cursor;
      const id = newId();
      const tag = `${prefix}-del`;
      const shared = await put('flights', id, { clubs: [club], club: { tag } }, {}, undefined, {}, env.token2);
      const key = (await feed(club, start)).items.find((f) => f.summary?.tag === tag)?.key;
      expect(key).toBeDefined();

      const mid = (await feed(club)).cursor;
      await del('flights', id, shared.body.version, env.token2);
      expect((await feed(club, mid)).items.find((f) => f.key === key)?.deleted).toBe(true);
    });
  });
}
