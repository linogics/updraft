export type SyncCollection = 'flights' | 'camera-paths' | 'prefs';

export const SYNC_COLLECTIONS: readonly SyncCollection[] = ['flights', 'camera-paths', 'prefs'];

/** Sync bookkeeping of one item. A dirty item still has to be pushed. */
export interface SyncMeta {
  /** `${collection}:${id}`. */
  key: string;
  collection: SyncCollection;
  id: string;
  /** The server version this device last saw. Null until the item exists on the server. */
  version: string | null;
  dirty: boolean;
  deleted: boolean;
  /** Client clock in ms per changed top level field. */
  times: Record<string, number>;
  /** Flights with a track only. The files are uploaded once. */
  tracksPushed?: { original: boolean; json: boolean };
  /** Prefs only: the raw localStorage value last pushed or applied. */
  raw?: string;
  /** Counts local writes, so a push that raced with an edit does not clear the dirty flag. */
  rev: number;
}

export interface SyncState {
  /** Where the feed of each collection continues. */
  cursors: Partial<Record<SyncCollection, string | null>>;
  /** `url|user` the local data was last synced with. */
  account?: string;
}

export const EMPTY_SYNC_STATE: SyncState = { cursors: {} };

/** The original file of an imported track. */
export interface Original {
  id: string;
  /** MIME type. */
  type: string;
  bytes: ArrayBuffer;
}

/** How a user can sign in to the server, as the capabilities offer it. */
export type AuthMethod = { kind: 'password' } | { kind: 'redirect'; id: string; label: string };
