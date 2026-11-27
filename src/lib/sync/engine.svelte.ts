import type { IndexedDbFlightRepository } from '../storage/indexeddb';
import { onLocalChange } from '../storage/localChange';
import { applyRemotePref, detectPrefChanges, localPref, SYNC_SECRET_KEYS } from './prefs';
import { SYNC_COLLECTIONS, type SyncCollection, type SyncMeta } from './types';
import { ApiError, type Item, type SyncApi } from './v2/http';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncOptions {
  /** Calls within this time after a run are ignored. */
  cooldownMs?: number;
  /** Wait after a local change before pushing. */
  debounceMs?: number;
  /** Called after a pull applied at least one change. */
  onApplied?: (count: number) => void;
  /** Largest feed page the server allows. */
  maxPage?: number;
}

const MAX_CONFLICTS = 5;

export class SyncEngine {
  status = $state<SyncStatus>('idle');
  lastSyncAt = $state<number | null>(null);
  lastError = $state<string | null>(null);

  private running: Promise<void> | null = null;
  private lastEnd = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private rerun = false;
  private unsubscribe: (() => void) | null = null;
  private readonly cooldownMs: number;
  private readonly debounceMs: number;
  private readonly onApplied?: (count: number) => void;
  private readonly maxPage: number;

  constructor(
    private repo: IndexedDbFlightRepository,
    private api: SyncApi,
    opts: SyncOptions = {}
  ) {
    this.cooldownMs = opts.cooldownMs ?? 5000;
    this.debounceMs = opts.debounceMs ?? 3000;
    this.onApplied = opts.onApplied;
    this.maxPage = Math.min(opts.maxPage ?? 100, 200);
  }

  /** Never throws, failures show up in `status` and `lastError`. */
  syncNow(): Promise<void> {
    if (this.running) return this.running;
    if (Date.now() - this.lastEnd < this.cooldownMs) return Promise.resolve();

    this.running = this.run().finally(() => {
      this.running = null;
      this.lastEnd = Date.now();
      if (this.rerun) {
        this.rerun = false;
        if (this.unsubscribe) this.schedule();
      }
    });
    return this.running;
  }

  start() {
    if (this.unsubscribe) return;

    window.addEventListener('focus', this.trigger);
    window.addEventListener('online', this.trigger);
    this.unsubscribe = onLocalChange(() => this.schedule());
    this.trigger();
  }

  stop() {
    window.removeEventListener('focus', this.trigger);
    window.removeEventListener('online', this.trigger);
    this.unsubscribe?.();
    this.unsubscribe = null;
    clearTimeout(this.timer);
    this.rerun = false;
  }

  private trigger = () => void this.syncNow();

  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.fire(), this.debounceMs);
  }

  private fire() {
    if (this.running) {
      // The running push may already be past the changes made since, so go again afterwards.
      this.rerun = true;
      return;
    }

    const wait = this.cooldownMs - (Date.now() - this.lastEnd);
    if (wait > 0) this.timer = setTimeout(() => this.fire(), wait);
    else this.trigger();
  }

  private async run() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.status = 'offline';
      return;
    }

    this.status = 'syncing';
    try {
      let applied = 0;
      for (const collection of SYNC_COLLECTIONS) {
        applied += await this.pull(collection);
        // After the pull, so a pref this device never synced does not beat the copy the server has.
        if (collection === 'prefs') await detectPrefChanges(this.repo);
        await this.push(collection);
      }

      if (applied) this.onApplied?.(applied);
      this.status = 'idle';
      this.lastSyncAt = Date.now();
      this.lastError = null;
    } catch (e) {
      this.status = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error';
      this.lastError = e instanceof Error ? e.message : String(e);
    }
  }

  /** Pages through the feed from the stored cursor. The cursor is saved per page, so an interrupted run resumes. */
  private async pull(collection: SyncCollection): Promise<number> {
    let cursor = (await this.repo.getSyncState()).cursors[collection] ?? null;
    let restarted = false;
    let applied = 0;
    for (;;) {
      let page;
      try {
        page = await this.api.listChanges(collection, cursor, this.maxPage);
      } catch (e) {
        // A cursor the server does not know any more means start again from the beginning.
        if (e instanceof ApiError && e.status === 400 && cursor !== null && !restarted) {
          cursor = null;
          restarted = true;
          continue;
        }

        throw e;
      }

      for (const item of page.items) if (await this.apply(collection, item)) applied++;

      cursor = page.cursor;
      const state = await this.repo.getSyncState();
      await this.repo.setSyncState({ ...state, cursors: { ...state.cursors, [collection]: cursor } });
      if (!page.more) return applied;
    }
  }

  private async apply(collection: SyncCollection, item: Item): Promise<boolean> {
    if (collection === 'prefs') return applyRemotePref(this.repo, item);
    return (await this.repo.applyRemote(collection, item)) === 'applied';
  }

  private async push(collection: SyncCollection) {
    for (const meta of (await this.repo.metas(collection)).filter((m) => m.dirty)) {
      await this.pushOne(collection, meta.id);
    }

    if (collection !== 'flights') return;

    for (const meta of await this.repo.metas('flights')) {
      const t = meta.tracksPushed;
      if (!meta.deleted && !meta.dirty && meta.version !== null && t && !(t.original && t.json)) {
        await this.uploadTracks(meta);
      }
    }
  }

  /** On a conflict the server's item is merged in and the write is tried again with its version. */
  private async pushOne(collection: SyncCollection, id: string) {
    for (let attempt = 0; attempt < MAX_CONFLICTS; attempt++) {
      const meta = await this.repo.getMeta(collection, id);
      if (!meta?.dirty) return;

      if (meta.deleted) {
        // A delete wins over a conflict, the next try uses the version the server has now.
        const res = meta.version === null ? 'gone' : await this.api.deleteItem(collection, id, meta.version);
        if (res === 'gone' || res.ok) {
          await this.repo.finishDelete(collection, id, meta.rev);
          return;
        }

        await this.apply(collection, res.item);
        continue;
      }

      const local = await this.readLocal(meta);
      if (!local) {
        await this.repo.deleteMeta(collection, id);
        return;
      }

      const res = await this.api.putItem(
        collection,
        id,
        { data: local.data, times: meta.times, ...(local.secret ? { secret: true } : {}) },
        meta.version
      );

      if (res.ok) {
        await this.repo.markPushed(collection, id, meta.rev, res.item.version);
        return;
      }

      await this.apply(collection, res.item);
    }

    throw new Error(`Could not sync "${id}", the server keeps changing it.`);
  }

  private async readLocal(meta: SyncMeta): Promise<{ data: Record<string, unknown>; secret?: boolean } | undefined> {
    if (meta.collection === 'prefs') {
      const pref = localPref(meta.id);
      return pref && { data: pref, secret: SYNC_SECRET_KEYS.includes(meta.id) };
    }

    const data = await this.repo.readData(meta.collection, meta.id);
    return data && { data };
  }

  /** Files are written once. The server saying "already there" or "no such flight" both end the job. */
  private async uploadTracks(meta: SyncMeta) {
    const { id } = meta;
    const upload = await this.repo.trackUpload(id);
    const done = { original: true, json: true };
    try {
      if (upload) {
        if (!meta.tracksPushed?.original && upload.original) {
          await this.api.putTrack(id, upload.original.bytes, upload.original.type);
        }

        await this.repo.markTracksPushed(id, { original: true });
        if (!meta.tracksPushed?.json) await this.api.putTrackJson(id, upload.fixes);
      }
    } catch (e) {
      // A file over the server limit is never going to fit, retrying every run would only repeat the failure.
      if (!(e instanceof ApiError && e.status === 413)) throw e;
    }

    await this.repo.markTracksPushed(id, done);
  }
}
