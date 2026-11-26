import PocketBase, { ClientResponseError, LocalAuthStore } from 'pocketbase';

import type { AuthMethod, BackendAdapter, BackendSession, SyncChange, SyncType } from '#lib/sync/types';

import type { BackendPlugin } from '../backendKind';

export interface PocketBaseConfig {
  url: string;
  /** Records per pull page. Only tests change it. */
  pageSize?: number;
}

const COLLECTION = 'records';
// Per push request, the server accepts at most 200 changes and 32 MB.
const MAX_CHANGES = 200;
const MAX_BYTES = 16 * 1024 * 1024;
const TYPES: readonly SyncType[] = ['flight', 'manual', 'cameraPath', 'pref'];

interface Row {
  id: string;
  type: SyncType;
  rid: string;
  updatedAt: number;
  deleted: boolean;
  data: unknown;
  owner: string;
  shared: boolean;
  summary: unknown;
  seq: number;
}

export function createPocketBase({ url, pageSize = 200 }: PocketBaseConfig): BackendAdapter {
  // The key has the url in it, so two servers never share a token. Parallel calls must not cancel each other.
  const pb = new PocketBase(url, new LocalAuthStore(`updraft_pb_auth:${url}`));
  pb.autoCancellation(false);

  const owner = () => {
    const id = pb.authStore.isValid ? pb.authStore.record?.id : undefined;
    if (!id) throw new Error('Not signed in.');
    return id;
  };

  const session = (): BackendSession | null => {
    const r = pb.authStore.record;
    if (!pb.authStore.isValid || !r) return null;
    return { user: String(r.email || r.name || r.username || r.id) };
  };

  const signedIn = (): BackendSession => {
    const s = session();
    if (!s) throw new Error('Sign in failed.');
    return s;
  };

  return {
    async authMethods() {
      const list = await pb.collection('users').listAuthMethods();
      const out: AuthMethod[] = [];
      if (list.password.enabled) out.push({ kind: 'password' });
      for (const p of list.oauth2.providers ?? []) out.push({ kind: 'redirect', id: p.name, label: p.displayName });
      return out;
    },

    async signIn(method, input = {}) {
      const users = pb.collection('users');
      if (method.kind === 'password') {
        await users.authWithPassword(input.identity ?? '', input.password ?? '');
      } else if (method.kind === 'redirect') {
        // Opens a popup, so the browser only allows it inside a user gesture such as a click.
        await users.authWithOAuth2({ provider: method.id }).catch((err) => {
          // Signup is off, so an unknown email makes PocketBase try to create an account, which only a superuser may.
          if (err instanceof ClientResponseError && err.status === 403) {
            throw new Error(
              `No account matches your ${method.label} email. Ask the server admin to create one with that email.`
            );
          }

          throw err;
        });
      } else {
        throw new Error('This sign in method is not supported.');
      }

      return signedIn();
    },

    signOut() {
      pb.authStore.clear();
      return Promise.resolve();
    },

    session,

    async push(changes) {
      owner();
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

        await pb.send('/api/updraft/push', { method: 'POST', body: { changes: chunk } }).catch((err) => {
          if (err instanceof ClientResponseError && err.status === 404) {
            throw new Error(
              'The sync server kit is outdated. Update server/pb_migrations and add server/pb_hooks, see the self-hosting docs.'
            );
          }

          throw err;
        });
      }
    },

    async pull(cursor) {
      const me = owner();
      // Shared flights of other pilots are readable too, but they are not part of this logbook.
      let filter = pb.filter('owner = {:me}', { me });
      // Any other cursor, such as the old `updated|id` one, means a full pull.
      const seq = cursor && /^\d+$/.test(cursor) ? cursor : null;
      if (seq) filter += pb.filter(' && seq > {:s}', { s: Number(seq) });

      const page = await pb.collection(COLLECTION).getList<Row>(1, pageSize, { filter, sort: 'seq', skipTotal: true });
      const changes: SyncChange[] = [];
      for (const r of page.items) {
        // The server is not trusted to match the schema, the engine validates the data itself.
        if (!TYPES.includes(r.type)) continue;
        const c: SyncChange = { type: r.type, id: r.rid, updatedAt: r.updatedAt };
        if (r.deleted) c.deleted = true;
        else c.data = r.data;
        changes.push(c);
      }

      const last = page.items.at(-1);
      return {
        changes,
        cursor: last ? String(last.seq) : seq,
        more: page.items.length === pageSize
      };
    },

    club: {
      async list() {
        const me = owner();
        // `fields` leaves out `data`, the track is only fetched when a flight is opened.
        const rows = await pb.collection(COLLECTION).getFullList<Row>({
          batch: 200,
          filter: 'shared = true && type = "flight" && deleted = false',
          fields: 'id,owner,summary',
          sort: 'created,id'
        });
        return rows.map((r) => ({ key: r.id, owner: r.owner, mine: r.owner === me, stats: r.summary }));
      },

      async flight(key) {
        owner();
        const row = await pb.collection(COLLECTION).getOne<Row>(key, { fields: 'id,shared,data' });
        // The view rule also shows own records, but this call is only for shared ones.
        if (!row.shared) throw new Error('This flight is not shared.');
        return row.data;
      }
    }
  };
}

const plugin: BackendPlugin = {
  id: 'updraft/pocketbase',
  name: 'PocketBase',
  kind: 'backend',
  apiVersion: 1,
  create: createPocketBase
};

export default plugin;
