import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPObjectStore,
  type IDBPTransaction,
  type StoreNames
} from 'idb';
import { parseTracks, type CameraTracks } from '../domain/cameraPath';
import type { Flight } from '../domain/model';
import type { XcLeague } from '../state/xcPrefs';
import type { SyncChange, SyncState, SyncType } from '../sync/types';
import type { XcScore } from '../xc/types';
import { notifyLocalChange } from './localChange';
import {
  summarize,
  type Backup,
  type FlightRepository,
  type FlightSummary,
  type ManualEntry,
  type MetaPatch
} from './repository';
import { isCameraPath, isFlight, isManual, isObj } from './validate';

interface CameraPath {
  /** Sorted flight ids joined with '|'. */
  key: string;
  tracks: CameraTracks;
}

interface XcRecord {
  /** `${flightId}|${league}`. */
  key: string;
  flightId: string;
  score: XcScore | null;
}

/** Sync bookkeeping per record. Dirty records still have to be pushed. */
interface SyncMeta {
  /** `${type}:${id}`. */
  key: string;
  type: SyncType;
  id: string;
  updatedAt: number;
  deleted?: true;
  dirty: 0 | 1;
}

const EMPTY_STATE: SyncState = { cursor: null, prefs: {} };

interface FlightDb extends DBSchema {
  flights: { key: string; value: Flight };
  summaries: { key: string; value: FlightSummary };
  cameraPaths: { key: string; value: CameraPath };
  xcScores: { key: string; value: XcRecord; indexes: { flightId: string } };
  sync: { key: string; value: SyncMeta };
  syncState: { key: string; value: SyncState };
}

type SyncStore = IDBPObjectStore<FlightDb, ArrayLike<StoreNames<FlightDb>>, 'sync', 'readwrite'>;

/** Strictly increasing per record, so a rewrite within the same millisecond is still seen as newer. */
async function markDirty(store: SyncStore, type: SyncType, id: string, deleted = false) {
  const key = `${type}:${id}`;
  const prev = await store.get(key);
  const updatedAt = Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1);
  await store.put({ key, type, id, updatedAt, ...(deleted ? { deleted: true as const } : {}), dirty: 1 });
}

/** Order-independent key for a set of flights. */
const xcKey = (flightId: string, league: XcLeague) => `${flightId}|${league}`;

const pathKey = (flightIds: string[]) => [...flightIds].sort().join('|');

export class IndexedDbFlightRepository implements FlightRepository {
  private db: Promise<IDBPDatabase<FlightDb>>;

  constructor(name = 'updraft') {
    // Version 2 added cameraPaths, version 3 xcScores, version 4 the sync stores. Each step only runs on older databases.
    this.db = openDB<FlightDb>(name, 4, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('flights', { keyPath: 'id' });
          db.createObjectStore('summaries', { keyPath: 'id' });
        }

        if (oldVersion < 2) db.createObjectStore('cameraPaths', { keyPath: 'key' });
        if (oldVersion < 3) db.createObjectStore('xcScores', { keyPath: 'key' }).createIndex('flightId', 'flightId');

        if (oldVersion < 4) {
          db.createObjectStore('sync', { keyPath: 'key' });
          db.createObjectStore('syncState');
        }
      }
    });
  }

  async getCameraTracks(flightIds: string[]): Promise<CameraTracks> {
    // Records of the old keyframe format have no tracks and fall back to the defaults.
    const record: { tracks?: unknown } | undefined = await (await this.db).get('cameraPaths', pathKey(flightIds));
    return parseTracks(record?.tracks);
  }

  async saveCameraTracks(flightIds: string[], tracks: CameraTracks): Promise<void> {
    const key = pathKey(flightIds);
    const tx = (await this.db).transaction(['cameraPaths', 'sync'], 'readwrite');
    await Promise.all([
      tx.objectStore('cameraPaths').put({ key, tracks }),
      markDirty(tx.objectStore('sync'), 'cameraPath', key),
      tx.done
    ]);
    notifyLocalChange();
  }

  async getXcScore(flightId: string, league: XcLeague): Promise<XcScore | null | undefined> {
    return (await (await this.db).get('xcScores', xcKey(flightId, league)))?.score;
  }

  async putXcScore(flightId: string, league: XcLeague, score: XcScore | null): Promise<void> {
    await (await this.db).put('xcScores', { key: xcKey(flightId, league), flightId, score });
  }

  async list(): Promise<FlightSummary[]> {
    const all = await (await this.db).getAll('summaries');
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.startTime - a.startTime);
  }

  async get(id: string): Promise<Flight | undefined> {
    return (await this.db).get('flights', id);
  }

  async save(flight: Flight): Promise<void> {
    const tx = (await this.db).transaction(['flights', 'summaries', 'sync'], 'readwrite');
    await Promise.all([
      tx.objectStore('flights').put(flight),
      tx.objectStore('summaries').put(summarize(flight)),
      markDirty(tx.objectStore('sync'), 'flight', flight.id),
      tx.done
    ]);
    notifyLocalChange();
  }

  async delete(id: string): Promise<void> {
    const tx = (await this.db).transaction(['flights', 'summaries', 'xcScores', 'sync'], 'readwrite');
    const scores = tx.objectStore('xcScores');
    const keys = await scores.index('flightId').getAllKeys(id);
    const summary = await tx.objectStore('summaries').get(id);
    const ops: Promise<unknown>[] = [
      tx.objectStore('flights').delete(id),
      tx.objectStore('summaries').delete(id),
      ...keys.map((k) => scores.delete(k)),
      tx.done
    ];
    if (summary) ops.push(markDirty(tx.objectStore('sync'), summary.manual ? 'manual' : 'flight', id, true));
    await Promise.all(ops);
    notifyLocalChange();
  }

  async saveManual(e: ManualEntry): Promise<void> {
    const startTime = new Date(`${e.date}T12:00:00`).getTime();
    const id = e.id ?? crypto.randomUUID();
    const tx = (await this.db).transaction(['summaries', 'sync'], 'readwrite');
    const put = tx.objectStore('summaries').put({
      id,
      sourceName: '',
      pilot: e.pilot,
      glider: e.glider,
      site: e.site,
      date: e.date,
      notes: e.notes,
      fixCount: 0,
      startTime,
      endTime: startTime + e.durationMin * 60_000,
      manual: true
    });
    await Promise.all([put, markDirty(tx.objectStore('sync'), 'manual', id), tx.done]);
    notifyLocalChange();
  }

  async updateMeta(id: string, patch: MetaPatch): Promise<void> {
    const tx = (await this.db).transaction(['flights', 'summaries', 'sync'], 'readwrite');
    const summary = await tx.objectStore('summaries').get(id);
    const flight = await tx.objectStore('flights').get(id);
    if (summary) await tx.objectStore('summaries').put({ ...summary, ...patch });
    if (flight) await tx.objectStore('flights').put({ ...flight, ...patch });
    if (summary) await markDirty(tx.objectStore('sync'), flight ? 'flight' : 'manual', id);
    await tx.done;
    if (summary) notifyLocalChange();
  }

  async exportAll(): Promise<Backup> {
    const db = await this.db;
    const [flights, summaries, cameraPaths] = await Promise.all([
      db.getAll('flights'),
      db.getAll('summaries'),
      db.getAll('cameraPaths')
    ]);
    return {
      app: 'updraft',
      version: 1,
      exportedAt: new Date().toISOString(),
      flights,
      manual: summaries.filter((s) => s.manual),
      cameraPaths,
      prefs: {}
    };
  }

  async importAll(backup: Backup, mode: 'merge' | 'replace'): Promise<void> {
    const names = ['flights', 'summaries', 'cameraPaths', 'xcScores', 'sync'] as const;
    const tx = (await this.db).transaction(names, 'readwrite');
    const sync = tx.objectStore('sync');
    const ops: Promise<unknown>[] = [tx.done];
    const kept = new Set([
      ...backup.flights.map((f) => `flight:${f.id}`),
      ...backup.manual.map((e) => `manual:${e.id}`),
      ...backup.cameraPaths.map((c) => `cameraPath:${c.key}`)
    ]);

    if (mode === 'replace') {
      // Whatever the import removes must reach the other devices as a delete.
      for (const s of await tx.objectStore('summaries').getAll()) {
        const type = s.manual ? 'manual' : 'flight';
        if (!kept.has(`${type}:${s.id}`)) ops.push(markDirty(sync, type, s.id, true));
      }

      for (const key of await tx.objectStore('cameraPaths').getAllKeys()) {
        if (!kept.has(`cameraPath:${key}`)) ops.push(markDirty(sync, 'cameraPath', key, true));
      }

      for (const n of ['flights', 'summaries', 'cameraPaths', 'xcScores'] as const) ops.push(tx.objectStore(n).clear());
    }

    // Notes live on the flight record, so rebuilt summaries keep them.
    for (const f of backup.flights) {
      ops.push(
        tx.objectStore('flights').put(f),
        tx.objectStore('summaries').put(summarize(f)),
        markDirty(sync, 'flight', f.id)
      );
    }

    for (const m of backup.manual) ops.push(tx.objectStore('summaries').put(m), markDirty(sync, 'manual', m.id));
    for (const c of backup.cameraPaths)
      ops.push(tx.objectStore('cameraPaths').put(c), markDirty(sync, 'cameraPath', c.key));
    await Promise.all(ops);
    notifyLocalChange();
  }

  async pendingChanges(): Promise<SyncChange[]> {
    const tx = (await this.db).transaction(['flights', 'summaries', 'cameraPaths', 'sync'], 'readonly');
    const changes: SyncChange[] = [];
    for (const m of await tx.objectStore('sync').getAll()) {
      if (!m.dirty) continue;

      const change: SyncChange = { type: m.type, id: m.id, updatedAt: m.updatedAt };
      if (m.deleted) {
        changes.push({ ...change, deleted: true });
        continue;
      }

      const data =
        m.type === 'flight'
          ? await tx.objectStore('flights').get(m.id)
          : m.type === 'manual'
            ? await tx.objectStore('summaries').get(m.id)
            : await tx.objectStore('cameraPaths').get(m.id);
      if (data) changes.push({ ...change, data });
    }

    return changes;
  }

  async markPushed(changes: SyncChange[]): Promise<void> {
    const tx = (await this.db).transaction('sync', 'readwrite');
    for (const c of changes) {
      const meta = await tx.store.get(`${c.type}:${c.id}`);
      if (meta?.dirty && meta.updatedAt === c.updatedAt) await tx.store.put({ ...meta, dirty: 0 });
    }

    await tx.done;
  }

  async applyRemote(changes: SyncChange[]): Promise<{ applied: number; invalid: number }> {
    const tx = (await this.db).transaction(['flights', 'summaries', 'cameraPaths', 'xcScores', 'sync'], 'readwrite');
    let applied = 0;
    let invalid = 0;
    for (const c of changes) {
      if (!this.validRemote(c)) {
        invalid++;
        continue;
      }

      const key = `${c.type}:${c.id}`;
      const meta = await tx.objectStore('sync').get(key);
      if (meta && c.updatedAt <= meta.updatedAt) continue;

      if (c.deleted) {
        await this.removeRecord(tx, c);
      } else if (c.type === 'flight') {
        await Promise.all([
          tx.objectStore('flights').put(c.data as Flight),
          tx.objectStore('summaries').put(summarize(c.data as Flight))
        ]);
      } else if (c.type === 'manual') {
        await tx.objectStore('summaries').put(c.data as FlightSummary);
      } else {
        await tx.objectStore('cameraPaths').put(c.data as CameraPath);
      }

      await tx.objectStore('sync').put({
        key,
        type: c.type,
        id: c.id,
        updatedAt: c.updatedAt,
        ...(c.deleted ? { deleted: true as const } : {}),
        dirty: 0
      });
      applied++;
    }

    await tx.done;
    return { applied, invalid };
  }

  async markAllDirty(): Promise<void> {
    const tx = (await this.db).transaction(['flights', 'summaries', 'cameraPaths', 'sync'], 'readwrite');
    const sync = tx.objectStore('sync');
    for (const meta of await sync.getAll()) if (!meta.dirty) await sync.put({ ...meta, dirty: 1 });

    // Records saved before sync existed have no metadata yet.
    const records: [SyncType, string][] = [
      ...(await tx.objectStore('flights').getAllKeys()).map((id): [SyncType, string] => ['flight', id]),
      ...(await tx.objectStore('summaries').getAll())
        .filter((s) => s.manual)
        .map((s): [SyncType, string] => ['manual', s.id]),
      ...(await tx.objectStore('cameraPaths').getAllKeys()).map((k): [SyncType, string] => ['cameraPath', k])
    ];
    for (const [type, id] of records) if (!(await sync.get(`${type}:${id}`))) await markDirty(sync, type, id);

    await tx.done;
  }

  async getSyncState(): Promise<SyncState> {
    return (await (await this.db).get('syncState', 'state')) ?? EMPTY_STATE;
  }

  async setSyncState(state: SyncState): Promise<void> {
    await (await this.db).put('syncState', state, 'state');
  }

  /** Remote data is untrusted, so shape and id are checked before anything is written. */
  private validRemote(c: SyncChange): boolean {
    if (!isObj(c) || typeof c.id !== 'string' || !c.id || !Number.isFinite(c.updatedAt)) return false;
    if (c.type !== 'flight' && c.type !== 'manual' && c.type !== 'cameraPath') return false;
    if (c.deleted) return true;

    const d = c.data;
    if (c.type === 'flight') return isFlight(d) && (d as Flight).id === c.id;
    if (c.type === 'manual') return isManual(d) && (d as FlightSummary).id === c.id;
    return isCameraPath(d) && (d as CameraPath).key === c.id;
  }

  private async removeRecord(
    tx: IDBPTransaction<FlightDb, ['flights', 'summaries', 'cameraPaths', 'xcScores', 'sync'], 'readwrite'>,
    c: SyncChange
  ) {
    if (c.type === 'cameraPath') {
      await tx.objectStore('cameraPaths').delete(c.id);
      return;
    }

    const scores = tx.objectStore('xcScores');
    const keys = c.type === 'flight' ? await scores.index('flightId').getAllKeys(c.id) : [];
    await Promise.all([
      tx.objectStore('flights').delete(c.id),
      tx.objectStore('summaries').delete(c.id),
      ...keys.map((k) => scores.delete(k))
    ]);
  }
}
