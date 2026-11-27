import type { AuthMethod, BackendAdapter, BackendSession, ClubEntry, SyncChange, SyncType } from '#lib/sync/types';

import type { BackendPlugin } from '../backendKind';

export interface HttpConfig {
  url: string;
}

// Per push request, the server accepts at most 200 changes and 32 MB.
const MAX_CHANGES = 200;
const MAX_BYTES = 16 * 1024 * 1024;
const PULL_LIMIT = 200;
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;
const TYPES: readonly SyncType[] = ['flight', 'manual', 'cameraPath', 'pref'];
// Routes every v1 server has, a 404 there means the server does not speak the spec.
const REQUIRED = ['', '/push', '/pull'];
const OUTDATED =
  'The sync server kit is outdated. Update server/pb_migrations and add server/pb_hooks, see the self-hosting docs.';

interface Capabilities {
  password: boolean;
  oauth: { id: string; label: string }[];
  club: boolean;
  signup: boolean;
}

interface Stored {
  token: string;
  user: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The server is not trusted to match the spec, so every field is checked. */
function parseCapabilities(raw: unknown): Capabilities {
  const o = isObject(raw) ? raw : {};
  const auth = isObject(o.auth) ? o.auth : {};
  if (o.version !== 1) throw new Error('This server does not speak the Updraft sync spec v1.');

  const oauth = (Array.isArray(auth.oauth) ? auth.oauth : []).filter(
    (p): p is { id: string; label: string } => isObject(p) && typeof p.id === 'string' && typeof p.label === 'string'
  );
  return { password: auth.password === true, signup: auth.signup === true, oauth, club: o.club === true };
}

/** A server session as sent by the sign in routes. */
function parseSession(raw: unknown): Stored | null {
  if (!isObject(raw) || typeof raw.token !== 'string' || !raw.token || !isObject(raw.user)) return null;
  const name = raw.user.name;
  return typeof name === 'string' && name ? { token: raw.token, user: name } : null;
}

function parseChange(raw: unknown): SyncChange | null {
  if (!isObject(raw) || !TYPES.includes(raw.type as SyncType)) return null;
  if (typeof raw.id !== 'string' || typeof raw.updatedAt !== 'number' || !isFinite(raw.updatedAt)) return null;

  const c: SyncChange = { type: raw.type as SyncType, id: raw.id, updatedAt: raw.updatedAt };
  // The engine validates the data itself.
  if (raw.deleted === true) c.deleted = true;
  else c.data = raw.data;
  return c;
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export function createHttp({ url }: HttpConfig): BackendAdapter {
  const api = `${url}/api/updraft/v1`;
  // The key has the url in it, so two servers never share a token.
  const key = `updraft_http_auth:${url}`;
  let caps: Promise<Capabilities> | null = null;
  let clubOffered = false;
  let signupOffered = false;

  const read = (): Stored | null => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      return isObject(raw) && typeof raw.token === 'string' && typeof raw.user === 'string'
        ? (raw as unknown as Stored)
        : null;
    } catch {
      return null;
    }
  };

  const write = (s: Stored | null) => {
    try {
      if (s) localStorage.setItem(key, JSON.stringify(s));
      else localStorage.removeItem(key);
    } catch {
      // Not persisted, the sign in lasts until the page closes.
    }
  };

  // Storage can fail, so the token also lives here for this page.
  let memory: Stored | null = null;
  const current = () => read() ?? memory;
  const store = (s: Stored | null) => {
    memory = s;
    write(s);
  };

  async function call(
    path: string,
    init: { method?: string; body?: unknown; authed?: boolean } = {}
  ): Promise<unknown> {
    const headers: Record<string, string> = {};
    if (init.authed) {
      const s = current();
      if (!s) throw new Error('Not signed in.');
      headers.authorization = `Bearer ${s.token}`;
    }

    if (init.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(api + path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
    const body: unknown = await res.json().catch(() => null);
    if (res.ok) return body;

    if (res.status === 404 && REQUIRED.includes(path.split('?')[0])) throw new Error(OUTDATED);

    if (res.status === 401 && init.authed) {
      store(null);
      throw new Error('Signed out, sign in again.');
    }

    const message = isObject(body) && typeof body.message === 'string' ? body.message : '';
    throw new Error(message || `The server answered ${res.status}.`);
  }

  const capabilities = (): Promise<Capabilities> => {
    // A failed request is not cached, so the next call asks again.
    caps ??= call('')
      .then(parseCapabilities)
      .then((c) => {
        clubOffered = c.club;
        signupOffered = c.signup;
        return c;
      })
      .catch((err: unknown) => {
        caps = null;
        throw err;
      });
    return caps;
  };

  const accept = (raw: unknown): BackendSession => {
    const s = parseSession(raw);
    if (!s) throw new Error('The server sent an invalid sign in answer.');
    store(s);
    return { user: s.user };
  };

  /** Runs in a popup. The server redirects it to /oauth-callback.html, which sends the result on a BroadcastChannel. */
  function signInRedirect(provider: string): Promise<BackendSession> {
    // Only a result that carries this value is accepted, so another tab or site cannot inject one.
    const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
    const channel = new BroadcastChannel('updraft-auth');
    const query = new URLSearchParams({ origin: location.origin, app_state: state });
    // Must run in the click, before any await.
    const popup = window.open(
      `${api}/auth/redirect/${encodeURIComponent(provider)}?${query}`,
      'updraft-auth',
      'popup,width=520,height=720'
    );

    if (!popup) {
      channel.close();
      throw new Error('The browser blocked the sign in window. Allow popups for this site.');
    }

    return new Promise((resolve, reject) => {
      // COOP can null the popup reference, so popup.closed is not used. The timeout ends a cancelled sign in.
      const timer = setTimeout(() => done(() => reject(new Error('Sign in was cancelled.'))), SIGN_IN_TIMEOUT_MS);
      const done = (fn: () => void) => {
        clearTimeout(timer);
        channel.close();
        fn();
      };

      channel.onmessage = (e: MessageEvent<unknown>) => {
        const d = e.data;
        if (!isObject(d) || d.type !== 'updraft-auth' || d.state !== state) return;

        if (typeof d.error === 'string') done(() => reject(new Error(d.error as string)));
        else {
          try {
            const session = accept(d);
            done(() => resolve(session));
          } catch (err) {
            done(() => reject(err instanceof Error ? err : new Error('Sign in failed.')));
          }
        }
      };
    });
  }

  const club = {
    async list(): Promise<ClubEntry[]> {
      const body = await call('/club', { authed: true });
      const flights = isObject(body) && Array.isArray(body.flights) ? body.flights : [];
      return flights.flatMap((f: unknown) =>
        isObject(f) && typeof f.key === 'string' && typeof f.owner === 'string' && typeof f.mine === 'boolean'
          ? [{ key: f.key, owner: f.owner, mine: f.mine, stats: f.stats }]
          : []
      );
    },

    async flight(flightKey: string) {
      const body = await call(`/club/${encodeURIComponent(flightKey)}`, { authed: true });
      return isObject(body) ? body.data : undefined;
    }
  };

  const adapter: BackendAdapter = {
    // Only there when the server announced it, so the capabilities must have been asked before.
    get club() {
      return clubOffered ? club : undefined;
    },

    // Only there when the server announced it, like club.
    get signUp() {
      return signupOffered
        ? async (input: { email: string; password: string }) =>
            accept(
              await call('/auth/signup', { method: 'POST', body: { email: input.email, password: input.password } })
            )
        : undefined;
    },

    async authMethods() {
      const c = await capabilities();
      const out: AuthMethod[] = [];
      if (c.password) out.push({ kind: 'password' });
      for (const p of c.oauth) out.push({ kind: 'redirect', id: p.id, label: p.label });
      return out;
    },

    async signIn(method, input = {}) {
      // No await before this, the popup needs the user gesture.
      if (method.kind === 'redirect') return signInRedirect(method.id);
      if (method.kind !== 'password') throw new Error('This sign in method is not supported.');

      return accept(
        await call('/auth/password', {
          method: 'POST',
          body: { identity: input.identity ?? '', password: input.password ?? '' }
        })
      );
    },

    signOut() {
      store(null);
      return Promise.resolve();
    },

    session() {
      const s = current();
      return s ? { user: s.user } : null;
    },

    async push(changes) {
      // Chunks stay well under the server body limit. A single large change goes alone.
      for (let i = 0; i < changes.length;) {
        let size = 0;
        const chunk: SyncChange[] = [];
        while (i < changes.length && chunk.length < MAX_CHANGES) {
          const next = JSON.stringify(changes[i]).length;
          if (chunk.length && size + next > MAX_BYTES) break;
          chunk.push(changes[i++]);
          size += next;
        }

        await call('/push', { method: 'POST', body: { changes: chunk }, authed: true });
      }
    },

    async pull(cursor) {
      // Any other cursor, such as the old `updated|id` one, means a full pull.
      const seq = cursor && /^\d+$/.test(cursor) ? cursor : null;
      const q = new URLSearchParams({ limit: String(PULL_LIMIT) });
      if (seq) q.set('cursor', seq);

      const body = await call(`/pull?${q}`, { authed: true });
      const o = isObject(body) ? body : {};
      if (!Array.isArray(o.changes) || (o.cursor !== null && typeof o.cursor !== 'string')) {
        throw new Error('The server sent an invalid pull answer.');
      }

      const changes = o.changes.map(parseChange).filter((c): c is SyncChange => c !== null);
      return { changes, cursor: o.cursor, more: o.more === true };
    }
  };

  return adapter;
}

const plugin: BackendPlugin = {
  id: 'updraft/http',
  name: 'Updraft sync server',
  kind: 'backend',
  apiVersion: 1,
  create: createHttp
};

export default plugin;
