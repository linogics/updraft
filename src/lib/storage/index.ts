import { IndexedDbFlightRepository } from './indexeddb';
import type { FlightRepository } from './repository';

// Single place to swap the IndexedDB repository for an HTTP one once the backend exists.
export const flightRepository: FlightRepository = new IndexedDbFlightRepository();

export type { FlightRepository, FlightSummary } from './repository';
