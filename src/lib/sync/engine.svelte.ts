import { onLocalChange } from '../storage/localChange';
import type { FlightRepository } from '../storage/repository';
import { applyRemotePrefs, collectPrefChanges } from './prefs';
import type { SyncTransport } from './types';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncOptions {
  /** Calls within this time after a run are ignored. */
  cooldownMs?: number;
  /** Wait after a local change before pushing. */
  debounceMs?: number;
  /** Called after a pull applied at least one change. */
  onApplied?: (count: number) => void;
}

const PAGE = 50;

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

  constructor(
    private repo: FlightRepository,
    private transport: SyncTransport,
    opts: SyncOptions = {}
  ) {
    this.cooldownMs = opts.cooldownMs ?? 5000;
    this.debounceMs = opts.debounceMs ?? 3000;
    this.onApplied = opts.onApplied;
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
      await this.push();
      await this.pull();
      this.status = 'idle';
      this.lastSyncAt = Date.now();
      this.lastError = null;
    } catch (e) {
      this.status = typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error';
      this.lastError = e instanceof Error ? e.message : String(e);
    }
  }

  private async push() {
    const state = await this.repo.getSyncState();
    const prefs = collectPrefChanges(state.prefs);
    const all = [...(await this.repo.pendingChanges()), ...prefs.changes];
    for (let i = 0; i < all.length; i += PAGE) {
      const page = all.slice(i, i + PAGE);
      await this.transport.push(page);
      await this.repo.markPushed(page);
    }

    // Remembered only after the whole push worked, so a failed run detects the prefs again.
    if (prefs.changes.length) await this.repo.setSyncState({ ...(await this.repo.getSyncState()), prefs: prefs.next });
  }

  private async pull() {
    let cursor = (await this.repo.getSyncState()).cursor;
    let applied = 0;
    for (;;) {
      const page = await this.transport.pull(cursor);
      applied += (await this.repo.applyRemote(page.changes.filter((c) => c.type !== 'pref'))).applied;

      const state = await this.repo.getSyncState();
      const prefs = applyRemotePrefs(
        page.changes.filter((c) => c.type === 'pref'),
        state.prefs
      );
      cursor = page.cursor;
      await this.repo.setSyncState({ ...state, cursor, prefs });
      if (!page.more) break;
    }

    if (applied) this.onApplied?.(applied);
  }
}
