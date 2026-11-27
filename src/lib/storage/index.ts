import { IndexedDbFlightRepository } from './indexeddb';

export const flightRepository = new IndexedDbFlightRepository();

export type { FlightSummary } from './repository';
