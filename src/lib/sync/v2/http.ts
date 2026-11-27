import type { components } from './openapi';

type Schemas = components['schemas'];

export type Capabilities = Schemas['Capabilities'];
export type Collection = components['parameters']['Collection'];
// The generator types an open object as `Record<string, never>`, so the free form parts are widened here.
type Fields = Record<string, unknown>;
export type Item = Omit<Schemas['Item'], 'data'> & { data?: Fields };
export type ItemPage = Omit<Schemas['ItemPage'], 'items'> & { items: Item[] };
export type ItemWrite = Omit<Schemas['ItemWrite'], 'data'> & { data: Fields };
export type Session = Schemas['Session'];
export type Club = Schemas['Club'];
export type ClubFlight = Omit<Schemas['ClubFlight'], 'summary'> & { summary?: Fields | null };
export type ClubFlightPage = Omit<Schemas['ClubFlightPage'], 'items'> & { items: ClubFlight[] };

export const API_PATH = '/api/updraft/v2';
export const NOT_V2 = 'This server does not speak sync v2.';

const MAX_TRIES = 4;
const MAX_WAIT_MS = 30_000;

/** An answer the caller can act on, such as 400 for a stale cursor. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
  }
}

export interface ApiOptions {
  /** Server address without the base path. */
  url: string;
  /** The bearer token, null when signed out. */
  token?: () => string | null;
  /** Called on a 401 of a signed in request. */
  onUnauthorized?: () => void;
  fetch?: typeof fetch;
  /** Replaced in tests, so a Retry-After does not slow them down. */
  sleep?: (ms: number) => Promise<void>;
}

/** A write that lost the race hands back the current item, so the caller can merge. */
export type WriteResult = { ok: true; item: Item } | { ok: false; item: Item };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The server is not trusted to match the spec, so an item is checked before anything uses it. */
export function parseItem(raw: unknown): Item | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  if (typeof raw.version !== 'string' || typeof raw.deleted !== 'boolean') return null;
  if (raw.deleted) return { id: raw.id, version: raw.version, deleted: true };
  if (!isObject(raw.data)) return null;

  const times: Record<string, number> = {};
  if (isObject(raw.times)) {
    for (const [k, v] of Object.entries(raw.times)) if (typeof v === 'number' && Number.isFinite(v)) times[k] = v;
  }

  return {
    id: raw.id,
    version: raw.version,
    deleted: false,
    data: raw.data,
    times,
    ...(raw.secret === true ? { secret: true } : {})
  };
}

function parsePage<T>(
  raw: unknown,
  parse: (row: unknown) => T | null
): { items: T[]; cursor: string | null; more: boolean } {
  if (!isObject(raw) || !Array.isArray(raw.items) || (raw.cursor !== null && typeof raw.cursor !== 'string')) {
    throw new Error('The server sent an invalid feed answer.');
  }

  return {
    items: raw.items.map(parse).filter((i): i is T => i !== null),
    cursor: raw.cursor,
    more: raw.more === true
  };
}

function parseClubFlight(raw: unknown): ClubFlight | null {
  if (!isObject(raw) || typeof raw.key !== 'string' || typeof raw.owner !== 'string') return null;
  if (typeof raw.mine !== 'boolean' || typeof raw.version !== 'string' || typeof raw.deleted !== 'boolean') return null;

  return {
    key: raw.key,
    owner: raw.owner,
    mine: raw.mine,
    version: raw.version,
    deleted: raw.deleted,
    hasTrack: raw.hasTrack === true,
    ...(isObject(raw.summary) ? { summary: raw.summary } : {})
  };
}

/** Typed calls of the sync spec v2. Retries 429 and 503, turns error bodies into messages. */
export class SyncApi {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: ApiOptions) {
    this.base = opts.url + API_PATH;
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Where the OAuth popup starts. */
  redirectUrl(provider: string, appState: string): string {
    const q = new URLSearchParams({ origin: location.origin, app_state: appState });
    return `${this.base}/auth/redirect/${encodeURIComponent(provider)}?${q}`;
  }

  async capabilities(): Promise<Capabilities> {
    const res = await this.send('', {});
    if (res.status === 404) throw new Error(NOT_V2);

    const body = await this.json(res);
    if (!isObject(body) || body.version !== 2) throw new Error(NOT_V2);

    const auth = isObject(body.auth) ? body.auth : {};
    const limits = isObject(body.limits) ? body.limits : {};
    const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d);
    return {
      version: 2,
      auth: {
        password: auth.password === true,
        signup: auth.signup === true,
        oauth: (Array.isArray(auth.oauth) ? auth.oauth : []).filter(
          (p): p is { id: string; label: string } =>
            isObject(p) && typeof p.id === 'string' && typeof p.label === 'string'
        )
      },
      clubs: body.clubs === true,
      limits: {
        maxPage: num(limits.maxPage, 100),
        maxItemBytes: num(limits.maxItemBytes, 1_000_000),
        maxTrackBytes: num(limits.maxTrackBytes, 5_000_000)
      }
    };
  }

  signInWithPassword(identity: string, password: string): Promise<Session> {
    return this.session('/auth/password', { identity, password });
  }

  signUp(email: string, password: string): Promise<Session> {
    return this.session('/auth/signup', { email, password });
  }

  async listChanges(collection: Collection, since: string | null, limit: number): Promise<ItemPage> {
    return parsePage(await this.authedJson(`/${collection}${feedQuery(since, limit)}`), parseItem);
  }

  async putItem(collection: Collection, id: string, write: ItemWrite, version: string | null): Promise<WriteResult> {
    const res = await this.send(`/${collection}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(write),
      headers: { 'content-type': 'application/json', ...precondition(version) },
      authed: true
    });
    return this.writeResult(res);
  }

  /** `gone` means the item never existed, so there is nothing left to delete. */
  async deleteItem(collection: Collection, id: string, version: string): Promise<WriteResult | 'gone'> {
    const res = await this.send(`/${collection}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: precondition(version),
      authed: true
    });
    if (res.status === 404) return 'gone';
    if (res.status === 204) return { ok: true, item: { id, version: '', deleted: true } };
    return this.writeResult(res);
  }

  /** `exists` means the file is already there, `gone` that the flight is not. Both count as done. */
  async putTrack(id: string, bytes: BodyInit, type: string): Promise<'ok' | 'exists' | 'gone'> {
    return this.putFile(`/flights/${encodeURIComponent(id)}/track`, bytes, type);
  }

  async putTrackJson(id: string, fixes: unknown[]): Promise<'ok' | 'exists' | 'gone'> {
    return this.putFile(`/flights/${encodeURIComponent(id)}/track.json`, JSON.stringify({ fixes }), 'application/json');
  }

  async getTrackJson(id: string): Promise<unknown[]> {
    return fixesOf(await this.authedJson(`/flights/${encodeURIComponent(id)}/track.json`));
  }

  async listClubs(): Promise<Club[]> {
    const body = await this.authedJson('/clubs');
    const rows = isObject(body) && Array.isArray(body.clubs) ? body.clubs : [];
    return rows.filter((c): c is Club => isObject(c) && typeof c.id === 'string' && typeof c.name === 'string');
  }

  async listClubFlights(clubId: string, since: string | null, limit: number): Promise<ClubFlightPage> {
    const path = `/clubs/${encodeURIComponent(clubId)}/flights${feedQuery(since, limit)}`;
    return parsePage(await this.authedJson(path), parseClubFlight);
  }

  async getClubTrackJson(clubId: string, key: string): Promise<unknown[]> {
    const path = `/clubs/${encodeURIComponent(clubId)}/flights/${encodeURIComponent(key)}/track.json`;
    return fixesOf(await this.authedJson(path));
  }

  private async session(path: string, body: unknown): Promise<Session> {
    const raw = await this.json(
      await this.send(path, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' }
      })
    );
    const user = isObject(raw) && isObject(raw.user) ? raw.user : null;
    if (!isObject(raw) || typeof raw.token !== 'string' || !raw.token || typeof user?.name !== 'string' || !user.name) {
      throw new Error('The server sent an invalid sign in answer.');
    }

    return { token: raw.token, user: { id: typeof user.id === 'string' ? user.id : '', name: user.name } };
  }

  private async putFile(path: string, body: BodyInit, type: string): Promise<'ok' | 'exists' | 'gone'> {
    const res = await this.send(path, {
      method: 'PUT',
      body,
      headers: { 'content-type': type, 'if-none-match': '*' },
      authed: true
    });
    if (res.status === 412) return 'exists';
    if (res.status === 404) return 'gone';
    if (!res.ok) throw await this.error(res);
    return 'ok';
  }

  private async writeResult(res: Response): Promise<WriteResult> {
    if (res.ok || res.status === 412) {
      const item = parseItem(await res.json().catch(() => null));
      if (!item) throw new Error('The server sent an invalid item.');
      return { ok: res.ok, item };
    }

    throw await this.error(res);
  }

  private authedJson(path: string): Promise<unknown> {
    return this.send(path, { authed: true }).then((res) => this.json(res));
  }

  private async json(res: Response): Promise<unknown> {
    if (!res.ok) throw await this.error(res);
    return res.json().catch(() => null) as Promise<unknown>;
  }

  private async error(res: Response): Promise<ApiError> {
    const body: unknown = await res.json().catch(() => null);
    const message = isObject(body) && typeof body.message === 'string' ? body.message : '';
    return new ApiError(message || `The server answered ${res.status}.`, res.status);
  }

  /** Waits and tries again on 429 and 503, as the server asks with Retry-After. */
  private async send(
    path: string,
    init: { method?: string; body?: BodyInit; headers?: Record<string, string>; authed?: boolean }
  ): Promise<Response> {
    const headers: Record<string, string> = { ...init.headers };
    if (init.authed) {
      const token = this.opts.token?.();
      if (!token) throw new Error('Not signed in.');
      headers.authorization = `Bearer ${token}`;
    }

    for (let attempt = 1; ; attempt++) {
      const res = await this.fetchFn(this.base + path, { method: init.method ?? 'GET', headers, body: init.body });
      if (res.status === 401 && init.authed) {
        this.opts.onUnauthorized?.();
        throw new ApiError('Signed out, sign in again.', 401);
      }

      if ((res.status !== 429 && res.status !== 503) || attempt >= MAX_TRIES) return res;

      const seconds = Number(res.headers.get('retry-after'));
      await this.sleep(Math.min(Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 1000, MAX_WAIT_MS));
    }
  }
}

const feedQuery = (since: string | null, limit: number) => {
  const q = new URLSearchParams({ limit: String(limit) });
  if (since !== null) q.set('since', since);
  return `?${q}`;
};

/** Create when there is no version yet, else update. The ETag value is the version in double quotes. */
const precondition = (version: string | null): Record<string, string> =>
  version === null ? { 'if-none-match': '*' } : { 'if-match': `"${version}"` };

function fixesOf(body: unknown): unknown[] {
  if (!isObject(body) || !Array.isArray(body.fixes)) throw new Error('The server sent an invalid track.');
  return body.fixes;
}
