import type { Flight } from '../domain/model';

/** Flight metadata without fixes, for listings. */
export interface FlightSummary {
  id: string;
  sourceName: string;
  pilot: string;
  glider: string | null;
  site: string | null;
  date: string;
  fixCount: number;
  startTime: number;
  endTime: number;
}

/**
 * Persistence boundary. V1 stores flights in the browser (IndexedDB);
 * a later HTTP implementation talks to the backend with the same contract.
 */
export interface FlightRepository {
  list(): Promise<FlightSummary[]>;
  get(id: string): Promise<Flight | undefined>;
  save(flight: Flight): Promise<void>;
  delete(id: string): Promise<void>;
}

export function summarize(flight: Flight): FlightSummary {
  const { fixes, ...meta } = flight;
  return { ...meta, fixCount: fixes.length, startTime: fixes[0].t, endTime: fixes[fixes.length - 1].t };
}
