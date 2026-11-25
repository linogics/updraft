import { isObj } from '#lib/storage/validate';
import PocketBase, { ClientResponseError, LocalAuthStore } from 'pocketbase';
import type { BackendPlugin } from '../backendKind';
import type { AuthMethod, BackendAdapter, BackendSession, SyncChange, SyncType } from '#lib/sync/types';

export interface PocketBaseConfig {
  url: string;
  /** Records per pull page. Only tests change it. */
  pageSize?: number;
}

const COLLECTION = 'records';
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
  updated: string;
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

  async function upsert(ownerId: string, c: SyncChange) {
    const filter = pb.filter('owner = {:o} && type = {:t} && rid = {:r}', { o: ownerId, t: c.type, r: c.id });
    const existing = await pb
      .collection(COLLECTION)
      .getFirstListItem<Row>(filter)
      .catch((err) => {
        if (err instanceof ClientResponseError && err.status === 404) return null;
        throw err;
      });
    const body: Record<string, unknown> = {
      updatedAt: c.updatedAt,
      deleted: c.deleted === true,
      data: c.deleted ? null : (c.data ?? null),
      shared: false,
      summary: null
    };

    // Only a live flight can be shared. The summary lets the club list skip the heavy `data` column.
    const flight = c.type === 'flight' && !c.deleted && isObj(c.data) ? c.data : null;
    if (flight?.shared === true) {
      body.shared = true;
      body.summary = flight.club ?? null;
    }

    if (!existing) {
      await pb.collection(COLLECTION).create({ owner: ownerId, type: c.type, rid: c.id, ...body });
    } else if (c.updatedAt > existing.updatedAt) {
      await pb.collection(COLLECTION).update(existing.id, body);
    }
  }

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

    async signOut() {
      pb.authStore.clear();
    },

    session,

    async push(changes) {
      const ownerId = owner();
      // shortcut: last write wins is checked here on the client, so two devices pushing the same record at the same
      // moment can race. Fine for one pilot, move the check into a server hook when that matters.
      for (const c of changes) await upsert(ownerId, c);
    },

    async pull(cursor) {
      const me = owner();
      // Shared flights of other pilots are readable too, but they are not part of this logbook.
      let filter = pb.filter('owner = {:me}', { me });
      const at = cursor?.indexOf('|') ?? -1;
      // shortcut: a record written in the same millisecond as the cursor but with a smaller id is missed until it
      // changes again. Rare enough for a club server, use a server side sequence number if it shows up.
      if (cursor && at > 0) {
        filter += pb.filter(' && (updated > {:u} || (updated = {:u} && id > {:id}))', {
          u: cursor.slice(0, at),
          id: cursor.slice(at + 1)
        });
      }

      const page = await pb
        .collection(COLLECTION)
        .getList<Row>(1, pageSize, { filter, sort: 'updated,id', skipTotal: true });
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
        cursor: last ? `${last.updated}|${last.id}` : cursor,
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
