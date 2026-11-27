import { type DBSchema, type IDBPDatabase, type IDBPTransaction, openDB } from 'idb';

import type { ClubStats } from '../club/stats';
import { type CameraTracks, parseTracks } from '../domain/cameraPath';
import type { Fix, Flight } from '../domain/model';
import { mergeItems } from '../sync/merge';
import { EMPTY_SYNC_STATE, type Original, type SyncCollection, type SyncMeta, type SyncState } from '../sync/types';
import type { Item } from '../sync/v2/http';
import { leagueCacheId } from '../xc/leagues';
import type { XcScore } from '../xc/types';
import { notifyLocalChange } from './localChange';
import { type Backup, type FlightSummary, type ManualEntry, type MetaPatch, summarize } from './repository';
import { isCameraData, isFlightData } from './validate';

/** What the logbook stores per flight. `club` is what club rankings read, it is not part of the public summary. */
export type StoredSummary = FlightSummary & { club?: ClubStats };

interface CameraPath {
  /** Sorted flight ids joined with '|'. */
  key: string;
  tracks: CameraTracks;
}

interface TrackRecord {
  id: string;
  fixes: Fix[];
}

interface XcRecord {
  /** `${flightId}|${league}`. */
  key: string;
  flightId: string;
  score: XcScore | null;
}

interface BadgeStatsRecord {
  /** `${flightId}|${league}`. */
  key: string;
  flightId: string;
  stats: ClubStats;
}

interface FlightDb extends DBSchema {
  summaries: { key: string; value: StoredSummary };
  tracks: { key: string; value: TrackRecord };
  originals: { key: string; value: Original };
  cameraPaths: { key: string; value: CameraPath };
  xcScores: { key: string; value: XcRecord; indexes: { flightId: string } };
  badgeStats: { key: string; value: BadgeStatsRecord; indexes: { flightId: string } };
  sync: { key: string; value: SyncMeta };
  syncState: { key: string; value: SyncState };
}

const STORES = [
  'summaries',
  'tracks',
  'originals',
  'cameraPaths',
  'xcScores',
  'badgeStats',
  'sync',
  'syncState'
] as const;

type Tx = IDBPTransaction<FlightDb, typeof STORES, 'readwrite'>;
type Data = Record<string, unknown>;

/** Metadata fields a user edit may change. `club` is set by the share flow. */
export type StoredMetaPatch = MetaPatch & { club?: ClubStats | null };

const clean = (o: Data): Data => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/** The synced `data` of a flight: the summary without its id. Manual is derived from `hasTrack`. */
export function flightData(s: StoredSummary): Data {
  const { id: _id, manual: _manual, ...rest } = s;
  return clean(rest);
}

const fromData = (id: string, data: Data): StoredSummary =>
  ({ id, ...data, ...(data.hasTrack === true ? {} : { manual: true }) }) as unknown as StoredSummary;

/**
 * Marks an item as changed by this device. Every changed top level field gets the current time, which is what
 * the per field merge compares. `next` undefined means a delete.
 */
async function markDirty(
  tx: Tx,
  collection: SyncCollection,
  id: string,
  change: { prev?: Data; next?: Data; hasTrack?: boolean }
) {
  const sync = tx.objectStore('sync');
  const key = `${collection}:${id}`;
  const meta = await sync.get(key);
  if (!change.next) {
    // Never reached the server, so there is nothing to tell it.
    if (!meta || meta.version === null) await sync.delete(key);
    else await sync.put({ ...meta, deleted: true, dirty: true, times: {}, tracksPushed: undefined, rev: meta.rev + 1 });
    return;
  }

  const alive = meta && !meta.deleted ? meta : undefined;
  const times = { ...alive?.times };
  const prev = alive ? change.prev : undefined;
  const now = Date.now();
  for (const k of new Set([...Object.keys(prev ?? {}), ...Object.keys(change.next)])) {
    // Strictly increasing per field, so a rewrite within the same millisecond still counts as newer.
    if (JSON.stringify(prev?.[k]) !== JSON.stringify(change.next[k])) times[k] = Math.max(now, (times[k] ?? 0) + 1);
  }

  const tracksPushed = alive?.tracksPushed ?? (change.hasTrack ? { original: false, json: false } : undefined);
  await sync.put({
    key,
    collection,
    id,
    version: meta?.version ?? null,
    dirty: true,
    deleted: false,
    times,
    ...(tracksPushed ? { tracksPushed } : {}),
    rev: (meta?.rev ?? 0) + 1
  });
}

/** Order-independent key for a set of flights. */
const xcKey = (flightId: string, league: string) => `${flightId}|${leagueCacheId(league)}`;

const pathKey = (flightIds: string[]) => [...flightIds].sort().join('|');

async function removeFlightRecords(tx: Tx, id: string) {
  const scores = tx.objectStore('xcScores');
  const stats = tx.objectStore('badgeStats');
  await Promise.all([
    tx.objectStore('summaries').delete(id),
    tx.objectStore('tracks').delete(id),
    tx.objectStore('originals').delete(id),
    ...(await scores.index('flightId').getAllKeys(id)).map((k) => scores.delete(k)),
    ...(await stats.index('flightId').getAllKeys(id)).map((k) => stats.delete(k))
  ]);
}

async function putFlight(tx: Tx, flight: Flight, original?: Original) {
  const summaries = tx.objectStore('summaries');
  const prev = await summaries.get(flight.id);
  const summary = summarize(flight);
  await Promise.all([
    summaries.put(summary),
    tx.objectStore('tracks').put({ id: flight.id, fixes: flight.fixes }),
    original ? tx.objectStore('originals').put(original) : tx.objectStore('originals').delete(flight.id)
  ]);
  await markDirty(tx, 'flights', flight.id, {
    prev: prev && flightData(prev),
    next: flightData(summary),
    hasTrack: true
  });
}

async function putManual(tx: Tx, summary: StoredSummary) {
  const prev = await tx.objectStore('summaries').get(summary.id);
  await tx.objectStore('summaries').put(summary);
  await markDirty(tx, 'flights', summary.id, { prev: prev && flightData(prev), next: flightData(summary) });
}

async function putCameraPath(tx: Tx, record: CameraPath) {
  const prev = await tx.objectStore('cameraPaths').get(record.key);
  await tx.objectStore('cameraPaths').put(record);
  await markDirty(tx, 'camera-paths', record.key, {
    prev: prev && { tracks: prev.tracks },
    next: { tracks: record.tracks }
  });
}

export class IndexedDbFlightRepository {
  private db: Promise<IDBPDatabase<FlightDb>>;

  constructor(name = 'updraft') {
    // Version 6 split flights into metadata and track, added originals and new sync stores. Pre-release, so an
    // older database is recreated instead of converted.
    this.db = openDB<FlightDb>(name, 6, {
      upgrade(db) {
        for (const n of Array.from(db.objectStoreNames)) db.deleteObjectStore(n);

        db.createObjectStore('summaries', { keyPath: 'id' });
        db.createObjectStore('tracks', { keyPath: 'id' });
        db.createObjectStore('originals', { keyPath: 'id' });
        db.createObjectStore('cameraPaths', { keyPath: 'key' });
        db.createObjectStore('xcScores', { keyPath: 'key' }).createIndex('flightId', 'flightId');
        db.createObjectStore('badgeStats', { keyPath: 'key' }).createIndex('flightId', 'flightId');
        db.createObjectStore('sync', { keyPath: 'key' });
        db.createObjectStore('syncState');
      }
    });
  }

  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const tx = (await this.db).transaction(STORES, 'readwrite');
    const [result] = await Promise.all([fn(tx), tx.done]);
    return result;
  }

  /** Camera tracks for a set of flights. The order of ids does not matter. Defaults when none saved. */
  async getCameraTracks(flightIds: string[]): Promise<CameraTracks> {
    // Records of the old keyframe format have no tracks and fall back to the defaults.
    const record: { tracks?: unknown } | undefined = await (await this.db).get('cameraPaths', pathKey(flightIds));
    return parseTracks(record?.tracks);
  }

  async saveCameraTracks(flightIds: string[], tracks: CameraTracks): Promise<void> {
    await this.write((tx) => putCameraPath(tx, { key: pathKey(flightIds), tracks }));
    notifyLocalChange();
  }

  /** Cached XC score. Undefined when never computed, null when computed but nothing scored. Dropped with the flight. */
  async getXcScore(flightId: string, league: string): Promise<XcScore | null | undefined> {
    return (await (await this.db).get('xcScores', xcKey(flightId, league)))?.score;
  }

  async putXcScore(flightId: string, league: string, score: XcScore | null): Promise<void> {
    await (await this.db).put('xcScores', { key: xcKey(flightId, league), flightId, score });
  }

  /** Cached club stats of a flight for the local badges. Undefined when never computed. Dropped with the flight. */
  async getBadgeStats(flightId: string, league: string): Promise<ClubStats | undefined> {
    return (await (await this.db).get('badgeStats', xcKey(flightId, league)))?.stats;
  }

  async putBadgeStats(flightId: string, league: string, stats: ClubStats): Promise<void> {
    await (await this.db).put('badgeStats', { key: xcKey(flightId, league), flightId, stats });
  }

  async list(): Promise<StoredSummary[]> {
    const all = await (await this.db).getAll('summaries');
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.startTime - a.startTime);
  }

  /** The flight with its track. Undefined for a manual entry, an unknown id or a flight whose track is not here yet. */
  async get(id: string): Promise<Flight | undefined> {
    const db = await this.db;
    const [summary, track] = await Promise.all([db.get('summaries', id), db.get('tracks', id)]);
    if (!summary || !track) return undefined;

    const {
      fixCount: _a,
      startTime: _b,
      endTime: _c,
      maxAlt: _d,
      trackKm: _e,
      hasTrack: _f,
      manual: _g,
      ...meta
    } = summary;
    return { ...meta, fixes: track.fixes };
  }

  /** Whether the logbook knows this id, with or without a track. */
  async summary(id: string): Promise<StoredSummary | undefined> {
    return (await this.db).get('summaries', id);
  }

  /** Stores a track fetched from the server. Not a local change, so nothing is pushed. */
  async storeTrack(id: string, fixes: Fix[]): Promise<void> {
    await this.write(async (tx) => {
      if (await tx.objectStore('summaries').get(id)) await tx.objectStore('tracks').put({ id, fixes });
    });
  }

  /** The original file is kept next to the track, `original` is left out for flights that came from nowhere. */
  async save(flight: Flight, original?: Original): Promise<void> {
    await this.write((tx) => putFlight(tx, flight, original));
    notifyLocalChange();
  }

  async delete(id: string): Promise<void> {
    await this.write(async (tx) => {
      const had = await tx.objectStore('summaries').get(id);
      await removeFlightRecords(tx, id);
      if (had) await markDirty(tx, 'flights', id, {});
    });
    notifyLocalChange();
  }

  async saveManual(e: ManualEntry): Promise<void> {
    const startTime = new Date(`${e.date}T12:00:00`).getTime();
    const id = e.id ?? crypto.randomUUID();
    await this.write((tx) =>
      putManual(tx, {
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
        hasTrack: false,
        manual: true
      })
    );
    notifyLocalChange();
  }

  async updateMeta(id: string, patch: StoredMetaPatch): Promise<void> {
    const changed = await this.write(async (tx) => {
      const summaries = tx.objectStore('summaries');
      const prev = await summaries.get(id);
      if (!prev) return false;

      const { club: clubPatch, ...fields } = patch;
      const next: StoredSummary = { ...prev, ...fields };
      if (clubPatch === null) delete next.club;
      else if (clubPatch) next.club = clubPatch;
      else if (prev.club) {
        const { pilot, glider, site } = patch;
        next.club = {
          ...prev.club,
          ...(pilot !== undefined && { pilot }),
          ...(glider !== undefined && { glider }),
          ...(site !== undefined && { site })
        };
      }

      await summaries.put(next);
      await markDirty(tx, 'flights', id, { prev: flightData(prev), next: flightData(next), hasTrack: next.hasTrack });
      return true;
    });
    if (changed) notifyLocalChange();
  }

  /** Flights with a local track, manual entries and camera paths. Prefs and token are added by the backup layer. */
  async exportAll(): Promise<Backup> {
    const db = await this.db;
    const [summaries, tracks, cameraPaths] = await Promise.all([
      db.getAll('summaries'),
      db.getAll('tracks'),
      db.getAll('cameraPaths')
    ]);
    const flights = (await Promise.all(tracks.map((t) => this.get(t.id)))).filter((f): f is Flight => !!f);
    return {
      app: 'updraft',
      version: 1,
      exportedAt: new Date().toISOString(),
      flights,
      manual: summaries.filter((s) => !s.hasTrack),
      cameraPaths,
      prefs: {}
    };
  }

  async importAll(backup: Backup, mode: 'merge' | 'replace'): Promise<void> {
    await this.write(async (tx) => {
      const kept = new Set([
        ...backup.flights.map((f) => `flights:${f.id}`),
        ...backup.manual.map((e) => `flights:${e.id}`),
        ...backup.cameraPaths.map((c) => `camera-paths:${c.key}`)
      ]);

      if (mode === 'replace') {
        // Whatever the import removes must reach the other devices as a delete.
        for (const s of await tx.objectStore('summaries').getAll()) {
          if (!kept.has(`flights:${s.id}`)) await markDirty(tx, 'flights', s.id, {});
        }

        for (const key of await tx.objectStore('cameraPaths').getAllKeys()) {
          if (!kept.has(`camera-paths:${key}`)) await markDirty(tx, 'camera-paths', key, {});
        }

        for (const n of ['summaries', 'tracks', 'originals', 'cameraPaths', 'xcScores', 'badgeStats'] as const) {
          await tx.objectStore(n).clear();
        }
      }

      for (const f of backup.flights) await putFlight(tx, f);
      for (const e of backup.manual) await putManual(tx, { ...e, hasTrack: false, manual: true });
      for (const c of backup.cameraPaths) await putCameraPath(tx, c);
    });
    notifyLocalChange();
  }

  async getSyncState(): Promise<SyncState> {
    return (await (await this.db).get('syncState', 'state')) ?? EMPTY_SYNC_STATE;
  }

  async setSyncState(state: SyncState): Promise<void> {
    await (await this.db).put('syncState', state, 'state');
  }

  async getMeta(collection: SyncCollection, id: string): Promise<SyncMeta | undefined> {
    return (await this.db).get('sync', `${collection}:${id}`);
  }

  async putMeta(meta: SyncMeta): Promise<void> {
    await (await this.db).put('sync', meta);
  }

  async deleteMeta(collection: SyncCollection, id: string): Promise<void> {
    await (await this.db).delete('sync', `${collection}:${id}`);
  }

  async metas(collection: SyncCollection): Promise<SyncMeta[]> {
    return (await (await this.db).getAll('sync')).filter((m) => m.collection === collection);
  }

  /** The synced data of a local flight or camera path, undefined when the record is gone. */
  async readData(collection: 'flights' | 'camera-paths', id: string): Promise<Data | undefined> {
    const db = await this.db;
    if (collection === 'flights') {
      const s = await db.get('summaries', id);
      return s && flightData(s);
    }

    const c = await db.get('cameraPaths', id);
    return c && { tracks: c.tracks };
  }

  /** The files a flight uploads. `original` is missing for flights that never had a file. */
  async trackUpload(id: string): Promise<{ fixes: Fix[]; original?: Original } | undefined> {
    const db = await this.db;
    const track = await db.get('tracks', id);
    return track && { fixes: track.fixes, original: await db.get('originals', id) };
  }

  async markTracksPushed(id: string, done: Partial<{ original: boolean; json: boolean }>): Promise<void> {
    const db = await this.db;
    const meta = await db.get('sync', `flights:${id}`);
    if (meta?.tracksPushed) await db.put('sync', { ...meta, tracksPushed: { ...meta.tracksPushed, ...done } });
  }

  /** Stores the version the server gave. The dirty flag stays when the item was written again during the push. */
  async markPushed(collection: SyncCollection, id: string, rev: number, version: string): Promise<void> {
    const db = await this.db;
    const meta = await db.get('sync', `${collection}:${id}`);
    if (meta) await db.put('sync', { ...meta, version, dirty: meta.dirty && meta.rev !== rev });
  }

  /** The delete reached the server. A record written again since keeps its meta and syncs as an update. */
  async finishDelete(collection: SyncCollection, id: string, rev: number): Promise<void> {
    const meta = await this.getMeta(collection, id);
    if (meta?.rev === rev && meta.deleted) await this.deleteMeta(collection, id);
  }

  /**
   * Applies an item from the server, from a feed or from a 412. A clean local item takes the remote one, a dirty
   * one is merged field by field and stays dirty. Invalid data from the server is skipped.
   */
  async applyRemote(collection: 'flights' | 'camera-paths', item: Item): Promise<'applied' | 'skipped' | 'invalid'> {
    return this.write(async (tx) => {
      const key = `${collection}:${item.id}`;
      const sync = tx.objectStore('sync');
      const meta = await sync.get(key);
      // Our own write comes back in the feed, there is nothing new in it.
      if (meta?.version === item.version) return 'skipped';

      if (item.deleted) {
        // A local edit wins over a remote delete, the item is created again with the tombstone version.
        if (meta?.dirty && !meta.deleted) {
          await sync.put({ ...meta, version: item.version, rev: meta.rev + 1 });
          return 'skipped';
        }

        if (collection === 'flights') await removeFlightRecords(tx, item.id);
        else await tx.objectStore('cameraPaths').delete(item.id);
        await sync.delete(key);
        return 'applied';
      }

      const data = item.data ?? {};
      if (collection === 'flights' ? !isFlightData(data) : !isCameraData(data)) return 'invalid';

      const remoteTimes = item.times ?? {};
      if (meta?.dirty) {
        // Delete wins over a remote edit, only the version moves on so the retry is accepted.
        if (meta.deleted) {
          await sync.put({ ...meta, version: item.version, rev: meta.rev + 1 });
          return 'skipped';
        }

        const local = await this.readDataIn(tx, collection, item.id);
        const merged = mergeItems({ data: local ?? {}, times: meta.times }, { data, times: remoteTimes });
        await this.writeData(tx, collection, item.id, merged.data);
        await sync.put({ ...meta, version: item.version, times: merged.times, rev: meta.rev + 1 });
        return 'applied';
      }

      await this.writeData(tx, collection, item.id, data);
      await sync.put({
        key,
        collection,
        id: item.id,
        version: item.version,
        dirty: false,
        deleted: false,
        times: remoteTimes,
        // Tracks of a remote flight are already there, this device never uploads them.
        ...(collection === 'flights' ? { tracksPushed: meta?.tracksPushed ?? { original: true, json: true } } : {}),
        rev: (meta?.rev ?? 0) + 1
      });
      return 'applied';
    });
  }

  /** Makes the next sync upload everything to a new account. Tombstones and prefs bookkeeping are dropped. */
  async markAllDirty(): Promise<void> {
    await this.write(async (tx) => {
      const sync = tx.objectStore('sync');
      for (const meta of await sync.getAll()) {
        if (meta.deleted || meta.collection === 'prefs') {
          await sync.delete(meta.key);
          continue;
        }

        const hasTrack = !!meta.tracksPushed;
        await sync.put({
          ...meta,
          version: null,
          dirty: true,
          rev: meta.rev + 1,
          ...(hasTrack ? { tracksPushed: { original: false, json: false } } : {})
        });
      }
    });
  }

  private async readDataIn(tx: Tx, collection: 'flights' | 'camera-paths', id: string): Promise<Data | undefined> {
    if (collection === 'flights') {
      const s = await tx.objectStore('summaries').get(id);
      return s && flightData(s);
    }

    const c = await tx.objectStore('cameraPaths').get(id);
    return c && { tracks: c.tracks };
  }

  private async writeData(tx: Tx, collection: 'flights' | 'camera-paths', id: string, data: Data) {
    if (collection === 'flights') {
      await tx.objectStore('summaries').put(fromData(id, data));
    } else {
      await tx.objectStore('cameraPaths').put({ key: id, tracks: data.tracks as CameraTracks });
    }
  }
}
