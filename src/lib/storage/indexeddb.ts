import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { parseTracks, type CameraTracks } from '../domain/cameraPath';
import type { Flight } from '../domain/model';
import { summarize, type FlightRepository, type FlightSummary } from './repository';

interface CameraPath {
  /** Sorted flight ids joined with '|'. */
  key: string;
  tracks: CameraTracks;
}

interface FlightDb extends DBSchema {
  flights: { key: string; value: Flight };
  summaries: { key: string; value: FlightSummary };
  cameraPaths: { key: string; value: CameraPath };
}

/** Order-independent key for a set of flights. */
const pathKey = (flightIds: string[]) => [...flightIds].sort().join('|');

export class IndexedDbFlightRepository implements FlightRepository {
  private db: Promise<IDBPDatabase<FlightDb>>;

  constructor(name = 'updraft') {
    // Version 2 added cameraPaths. Each step only runs on databases older than it.
    this.db = openDB<FlightDb>(name, 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('flights', { keyPath: 'id' });
          db.createObjectStore('summaries', { keyPath: 'id' });
        }
        if (oldVersion < 2) db.createObjectStore('cameraPaths', { keyPath: 'key' });
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

  async list(): Promise<FlightSummary[]> {
    const all = await (await this.db).getAll('summaries');
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.startTime - a.startTime);
  }

  async get(id: string): Promise<Flight | undefined> {
    return (await this.db).get('flights', id);
  }

  async save(flight: Flight): Promise<void> {
    const tx = (await this.db).transaction(['flights', 'summaries'], 'readwrite');
    await Promise.all([tx.objectStore('flights').put(flight), tx.objectStore('summaries').put(summarize(flight)), tx.done]);
  }

  async delete(id: string): Promise<void> {
    const tx = (await this.db).transaction(['flights', 'summaries'], 'readwrite');
    await Promise.all([tx.objectStore('flights').delete(id), tx.objectStore('summaries').delete(id), tx.done]);
  }
}
