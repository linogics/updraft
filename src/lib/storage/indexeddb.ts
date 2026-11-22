import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Flight } from '../domain/model';
import { summarize, type FlightRepository, type FlightSummary } from './repository';

interface FlightDb extends DBSchema {
  flights: { key: string; value: Flight };
  summaries: { key: string; value: FlightSummary };
}

export class IndexedDbFlightRepository implements FlightRepository {
  private db: Promise<IDBPDatabase<FlightDb>>;

  constructor(name = 'updraft') {
    this.db = openDB<FlightDb>(name, 1, {
      upgrade(db) {
        db.createObjectStore('flights', { keyPath: 'id' });
        db.createObjectStore('summaries', { keyPath: 'id' });
      }
    });
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
