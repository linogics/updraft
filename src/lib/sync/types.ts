export type {
  AuthMethod,
  BackendAdapter,
  BackendSession,
  ClubAccess,
  ClubEntry,
  SyncChange,
  SyncTransport,
  SyncType
} from '#lib/plugins/api';

export interface SyncState {
  cursor: string | null;
  /** Last seen raw localStorage value and change time per synced pref key. */
  prefs: Record<string, { raw: string; updatedAt: number }>;
  /** `backend|url|user` the local data was last synced with. */
  account?: string;
}
