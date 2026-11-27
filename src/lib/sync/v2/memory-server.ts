// A minimal in-memory implementation of the sync HTTP spec v2. It is a test fixture that proves the spec can be
// implemented and runs the contract suite in normal CI. Auth routes and CORS are left out on purpose.

export interface MemoryServerOptions {
  /** Maps a bearer token to an account id. */
  tokens: Record<string, string>;
  /** Clubs by id, each with the account ids that are members. */
  clubs?: Record<string, { name: string; members: string[] }>;
}

interface Stored {
  id: string;
  version: string;
  deleted: boolean;
  data?: object;
  times?: Record<string, number>;
  secret?: boolean;
}

interface Track {
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

interface ClubEntry {
  key: string;
  club: string;
  owner: string;
  flight: string;
  seq: number;
  deleted: boolean;
  summary: object | null;
  hasTrack: boolean;
}

const LIMITS = { maxPage: 100, maxItemBytes: 1_000_000, maxTrackBytes: 5_000_000 };
const COLLECTIONS = ['flights', 'camera-paths', 'prefs'];

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const fail = (status: number, message: string) => json(status, { message });
const etag = (item: Stored) => ({ etag: `"${item.version}"` });

export function createMemoryServer(options: MemoryServerOptions): (req: Request) => Promise<Response> {
  const clubs = options.clubs ?? {};
  // One counter orders every write of the server. Its value is the cursor and the version.
  let seq = 0;
  const items = new Map<string, Stored & { seq: number }>();
  const tracks = new Map<string, Track>();
  const entries: ClubEntry[] = [];

  const itemKey = (account: string, collection: string, id: string) => `${account}/${collection}/${id}`;
  const publicItem = ({ seq: _seq, ...item }: Stored & { seq: number }): Stored => item;

  function page<T extends { seq: number }>(rows: T[], url: URL, map: (row: T) => unknown): Response {
    const since = url.searchParams.get('since');
    const limitText = url.searchParams.get('limit');
    const limit = limitText === null ? LIMITS.maxPage : Number(limitText);
    if (!Number.isInteger(limit) || limit < 1 || limit > LIMITS.maxPage) return fail(400, 'Bad limit');

    // A cursor is a counter value. One from the future is a cursor this server never gave out.
    if (since !== null && (!/^[0-9]+$/.test(since) || Number(since) > seq)) return fail(400, 'Bad cursor');

    const after = Number(since ?? 0);
    const found = rows.filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq);
    const out = found.slice(0, limit);
    const cursor = out.length ? String(out[out.length - 1].seq) : since;
    return json(200, { items: out.map(map), cursor, more: out.length === limit });
  }

  function syncEntries(account: string, id: string, item: Stored) {
    const data = (item.data ?? {}) as { clubs?: string[]; club?: object; hasTrack?: boolean };
    const shared = item.deleted ? [] : (data.clubs ?? []);

    for (const club of Object.keys(clubs)) {
      let entry = entries.find((e) => e.club === club && e.owner === account && e.flight === id);
      if (!entry && !shared.includes(club)) continue;

      entry ??= {
        key: `k${entries.length + 1}`,
        club,
        owner: account,
        flight: id,
        seq: 0,
        deleted: true,
        summary: null,
        hasTrack: false
      };
      if (!entries.includes(entry)) entries.push(entry);

      entry.seq = ++seq;
      entry.deleted = !shared.includes(club);
      entry.summary = data.club ?? null;
      entry.hasTrack = data.hasTrack === true;
    }
  }

  async function handleItem(req: Request, account: string, collection: string, id: string): Promise<Response> {
    const key = itemKey(account, collection, id);
    const cur = items.get(key);

    if (req.method === 'GET') {
      return cur ? json(200, publicItem(cur), etag(cur)) : fail(404, 'Not found');
    }

    const ifMatch = req.headers.get('if-match');
    const ifNone = req.headers.get('if-none-match');
    if (!ifMatch && ifNone !== '*') return fail(428, 'Send If-Match or If-None-Match');
    if (ifNone === '*' && cur) return json(412, publicItem(cur), etag(cur));
    if (ifMatch && !cur) return fail(404, 'Not found');
    if (ifMatch && cur && ifMatch !== `"${cur.version}"`) return json(412, publicItem(cur), etag(cur));

    if (req.method === 'DELETE') {
      const tomb = { id, version: String(++seq), deleted: true, seq };
      items.set(key, tomb);
      for (const t of ['track', 'track.json']) tracks.delete(`${key}/${t}`);
      if (collection === 'flights') syncEntries(account, id, tomb);
      return new Response(null, { status: 204 });
    }

    const text = await req.text();
    if (text.length > LIMITS.maxItemBytes) return fail(413, 'Too large');

    let body: { data?: unknown; times?: unknown; secret?: unknown };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return fail(400, 'Invalid JSON');
    }

    const objectLike = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
    const timesOk = objectLike(body.times) && Object.values(body.times as object).every((n) => typeof n === 'number');
    if (!objectLike(body.data) || !timesOk) return fail(400, 'Expected data and times');
    if (body.secret !== undefined && typeof body.secret !== 'boolean') return fail(400, 'secret must be a boolean');

    const next = {
      id,
      version: String(++seq),
      deleted: false,
      data: body.data as object,
      times: body.times as Record<string, number>,
      ...(body.secret === true && collection === 'prefs' ? { secret: true } : {}),
      seq
    };
    items.set(key, next);
    if (collection === 'flights') syncEntries(account, id, next);
    return json(200, publicItem(next), etag(next));
  }

  async function handleTrack(req: Request, account: string, id: string, kind: string): Promise<Response> {
    const itemPath = itemKey(account, 'flights', id);
    const path = `${itemPath}/${kind}`;

    if (req.method === 'GET') {
      const t = tracks.get(path);
      return t ? new Response(t.bytes, { headers: { 'content-type': t.type } }) : fail(404, 'No track');
    }

    if (req.headers.get('if-none-match') !== '*') return fail(428, 'Send If-None-Match: *');

    const flight = items.get(itemPath);
    if (!flight || flight.deleted) return fail(404, 'No such flight');
    if (tracks.has(path)) return fail(412, 'Track already there');

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length > LIMITS.maxTrackBytes) return fail(413, 'Too large');

    tracks.set(path, { type: req.headers.get('content-type') ?? 'application/octet-stream', bytes });
    return new Response(null, { status: 201 });
  }

  function clubTrack(account: string, club: string, key: string, kind: string): Response {
    const entry = entries.find((e) => e.club === club && e.key === key && !e.deleted);
    const t = entry && tracks.get(`${itemKey(entry.owner, 'flights', entry.flight)}/${kind}`);
    return t ? new Response(t.bytes, { headers: { 'content-type': t.type } }) : fail(404, 'Not found');
  }

  return async (req) => {
    const url = new URL(req.url);
    const parts = url.pathname
      .replace(/^\/api\/updraft\/v2\/?/, '')
      .split('/')
      .filter(Boolean)
      .map(decodeURIComponent);
    const [a, b, c, d, e] = parts;
    if (!url.pathname.startsWith('/api/updraft/v2')) return fail(404, 'Not found');

    if (!a && req.method === 'GET') {
      const oauth: unknown[] = [];
      return json(200, {
        version: 2,
        auth: { password: false, signup: false, oauth },
        clubs: Object.keys(clubs).length > 0,
        limits: LIMITS
      });
    }

    const token = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1];
    const account = token ? options.tokens[token] : undefined;
    if (!account) return fail(401, 'Sign in first');

    const get = req.method === 'GET';
    if (a === 'clubs' && !b && get) {
      const mine = Object.entries(clubs).filter(([, c2]) => c2.members.includes(account));
      return json(200, { clubs: mine.map(([id, c2]) => ({ id, name: c2.name })) });
    }

    if (a === 'clubs' && c === 'flights' && get) {
      const club = clubs[b];
      if (!club?.members.includes(account)) return fail(404, 'Not found');

      if (!d) {
        const rows = entries.filter((x) => x.club === b);
        return page(rows, url, (x) => ({
          key: x.key,
          owner: x.owner,
          mine: x.owner === account,
          version: String(x.seq),
          deleted: x.deleted,
          ...(x.deleted ? {} : { summary: x.summary }),
          hasTrack: x.hasTrack
        }));
      }

      if (e === 'track' || e === 'track.json') return clubTrack(account, b, d, e);
    }

    if (COLLECTIONS.includes(a) && !b && get) {
      const rows = [...items.entries()].filter(([k]) => k.startsWith(`${account}/${a}/`)).map(([, v]) => v);
      return page(rows, url, publicItem);
    }

    if (COLLECTIONS.includes(a) && b && !c) return handleItem(req, account, a, b);

    if (a === 'flights' && b && (c === 'track' || c === 'track.json') && !d && ['GET', 'PUT'].includes(req.method)) {
      return handleTrack(req, account, b, c);
    }

    return fail(404, 'Not found');
  };
}
