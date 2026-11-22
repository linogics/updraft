import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Keyframe } from '../domain/cameraPath';
import type { Flight } from '../domain/model';
import { summarize, type FlightRepository, type FlightSummary } from './repository';

interface CameraPath {
  /** Sorted flight ids joined with '|'. */
  key: string;
  keys: Keyframe[];
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

  async getCameraPath(flightIds: string[]): Promise<Keyframe[]> {
    return (await (await this.db).get('cameraPaths', pathKey(flightIds)))?.keys ?? [];
  }

  async saveCameraPath(flightIds: string[], keys: Keyframe[]): Promise<void> {
    await (await this.db).put('cameraPaths', { key: pathKey(flightIds), keys });
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
