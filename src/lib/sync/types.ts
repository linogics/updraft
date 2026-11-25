export type SyncType = 'flight' | 'manual' | 'cameraPath' | 'pref';

/** One record version. `data` is the Flight, the manual FlightSummary, `{ key, tracks }` or the pref value. */
export interface SyncChange {
  type: SyncType;
  id: string;
  /** Client clock in ms. The higher value wins per whole record. */
  updatedAt: number;
  deleted?: true;
  data?: unknown;
}

/** Login and auth are the transport's own business. */
export interface SyncTransport {
  push(changes: SyncChange[]): Promise<void>;
  pull(cursor: string | null): Promise<{ changes: SyncChange[]; cursor: string | null; more?: boolean }>;
}

export interface SyncState {
  cursor: string | null;
  /** Last seen raw localStorage value and change time per synced pref key. */
  prefs: Record<string, { raw: string; updatedAt: number }>;
}
