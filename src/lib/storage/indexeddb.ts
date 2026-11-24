import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { parseTracks, type CameraTracks } from '../domain/cameraPath';
import type { Flight } from '../domain/model';
import type { XcLeague } from '../state/xcPrefs';
import type { XcScore } from '../xc/types';
import {
  summarize,
  type Backup,
  type FlightRepository,
  type FlightSummary,
  type ManualEntry,
  type MetaPatch
} from './repository';

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

interface FlightDb extends DBSchema {
  flights: { key: string; value: Flight };
  summaries: { key: string; value: FlightSummary };
  cameraPaths: { key: string; value: CameraPath };
  xcScores: { key: string; value: XcRecord; indexes: { flightId: string } };
}

/** Order-independent key for a set of flights. */
const xcKey = (flightId: string, league: XcLeague) => `${flightId}|${league}`;

const pathKey = (flightIds: string[]) => [...flightIds].sort().join('|');

export class IndexedDbFlightRepository implements FlightRepository {
  private db: Promise<IDBPDatabase<FlightDb>>;

  constructor(name = 'updraft') {
    // Version 2 added cameraPaths, version 3 xcScores. Each step only runs on databases older than it.
    this.db = openDB<FlightDb>(name, 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('flights', { keyPath: 'id' });
          db.createObjectStore('summaries', { keyPath: 'id' });
        }

        if (oldVersion < 2) db.createObjectStore('cameraPaths', { keyPath: 'key' });
        if (oldVersion < 3) db.createObjectStore('xcScores', { keyPath: 'key' }).createIndex('flightId', 'flightId');
      }
    });
  }

  async getCameraTracks(flightIds: string[]): Promise<CameraTracks> {
    // Records of the old keyframe format have no tracks and fall back to the defaults.
    const record: { tracks?: unknown } | undefined = await (await this.db).get('cameraPaths', pathKey(flightIds));
    return parseTracks(record?.tracks);
  }

  async saveCameraTracks(flightIds: string[], tracks: CameraTracks): Promise<void> {
    await (await this.db).put('cameraPaths', { key: pathKey(flightIds), tracks });
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
    const tx = (await this.db).transaction(['flights', 'summaries'], 'readwrite');
    await Promise.all([
      tx.objectStore('flights').put(flight),
      tx.objectStore('summaries').put(summarize(flight)),
      tx.done
    ]);
  }

  async delete(id: string): Promise<void> {
    const tx = (await this.db).transaction(['flights', 'summaries', 'xcScores'], 'readwrite');
    const scores = tx.objectStore('xcScores');
    const keys = await scores.index('flightId').getAllKeys(id);
    await Promise.all([
      tx.objectStore('flights').delete(id),
      tx.objectStore('summaries').delete(id),
      ...keys.map((k) => scores.delete(k)),
      tx.done
    ]);
  }

  async saveManual(e: ManualEntry): Promise<void> {
    const startTime = new Date(`${e.date}T12:00:00`).getTime();
    await (
      await this.db
    ).put('summaries', {
      id: e.id ?? crypto.randomUUID(),
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
  }

  async updateMeta(id: string, patch: MetaPatch): Promise<void> {
    const tx = (await this.db).transaction(['flights', 'summaries'], 'readwrite');
    const summary = await tx.objectStore('summaries').get(id);
    const flight = await tx.objectStore('flights').get(id);
    if (summary) await tx.objectStore('summaries').put({ ...summary, ...patch });
    if (flight) await tx.objectStore('flights').put({ ...flight, ...patch });
    await tx.done;
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
    const tx = (await this.db).transaction(['flights', 'summaries', 'cameraPaths', 'xcScores'], 'readwrite');
    const ops: Promise<unknown>[] = [tx.done];
    if (mode === 'replace')
      for (const n of ['flights', 'summaries', 'cameraPaths', 'xcScores'] as const) ops.push(tx.objectStore(n).clear());

    // Notes live on the flight record, so rebuilt summaries keep them.
    for (const f of backup.flights) {
      ops.push(tx.objectStore('flights').put(f), tx.objectStore('summaries').put(summarize(f)));
    }

    for (const m of backup.manual) ops.push(tx.objectStore('summaries').put(m));
    for (const c of backup.cameraPaths) ops.push(tx.objectStore('cameraPaths').put(c));
    await Promise.all(ops);
  }
}
