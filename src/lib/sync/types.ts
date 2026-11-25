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

/** A transport that also owns login. The adapter keeps its own token, the app never sees one. */
export interface BackendAdapter extends SyncTransport {
  authMethods(): Promise<AuthMethod[]>;
  /** A `redirect` method opens a popup, so call this from a user gesture. */
  signIn(method: AuthMethod, input?: Record<string, string>): Promise<BackendSession>;
  signOut(): Promise<void>;
  /** The stored session, survives a reload. */
  session(): BackendSession | null;
}
