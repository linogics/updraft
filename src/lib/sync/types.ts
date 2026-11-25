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
  /** `backend|url|user` the local data was last synced with. */
  account?: string;
}

/** How a user can sign in to a backend. The adapter reports what its server offers. */
export type AuthMethod =
  /** The app shows a generic identity and password form. */
  | { kind: 'password' }
  /** OAuth or SSO. The adapter runs the popup or redirect itself. */
  | { kind: 'redirect'; id: string; label: string }
  /** One time code in two steps. Reserved, no adapter implements it yet. */
  | { kind: 'code'; label: string };

export interface BackendSession {
  /** Display name or email. */
  user: string;
}

/** One shared flight in the club list. `stats` comes from the server and must be validated before use. */
export interface ClubEntry {
  /** Server row id, pass it to `club.flight`. */
  key: string;
  /** Opaque account id. All flights of one pilot share it. */
  owner: string;
  mine: boolean;
  stats: unknown;
}

/** Optional: lists flights that pilots shared with everyone on the server. */
export interface ClubAccess {
  /** Every shared flight of every pilot, without the tracks. */
  list(): Promise<ClubEntry[]>;
  /** The full record of one shared flight. Untrusted, validate it. */
  flight(key: string): Promise<unknown>;
}

/** A transport that also owns login. The adapter keeps its own token, the app never sees one. */
export interface BackendAdapter extends SyncTransport {
  authMethods(): Promise<AuthMethod[]>;
  /** A `redirect` method opens a popup, so call this from a user gesture. */
  signIn(method: AuthMethod, input?: Record<string, string>): Promise<BackendSession>;
  signOut(): Promise<void>;
  /** The stored session, survives a reload. */
  session(): BackendSession | null;
  club?: ClubAccess;
}
