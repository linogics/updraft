import { loadClub, loadClubFlight } from '#lib/club';
import type { BackendPlugin } from '#lib/plugins/backendKind';
import { BUILTIN_BACKENDS } from '#lib/plugins/builtin';
import { loadPlugin, validatePlugin } from '#lib/plugins/core';
import { pluginPrefs } from '#lib/plugins/pluginPrefs.svelte';
import { flightRepository } from '#lib/storage';
import type { FlightRepository } from '#lib/storage/repository';

import { loadSyncConfig, parseSyncConfig, type SyncConfig, writeOverride } from './config';
import { SyncEngine, type SyncOptions } from './engine.svelte';
import type { AuthMethod, BackendAdapter, BackendSession } from './types';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Finds a backend plugin by id, bundled ones first, then installed ones. Throws an Error for the user. */
async function loadBackend(id: string): Promise<BackendPlugin> {
  const bundled = BUILTIN_BACKENDS.find((b) => b.id === id);
  const entry = pluginPrefs.list.find((e) => e.kind === 'backend' && e.id === id);
  if (!bundled && !entry) throw new Error(`The backend "${id}" is not installed.`);

  const plugin = bundled ? validatePlugin((await bundled.load()).default) : await loadPlugin(entry!.url);
  if (plugin.kind !== 'backend' || plugin.id !== id) throw new Error(`"${id}" is not a sync backend.`);
  return plugin;
}

export interface ClientDeps {
  repo?: FlightRepository;
  loadBackend?: (id: string) => Promise<BackendPlugin>;
  engine?: SyncOptions;
}

/** Owns the one adapter and the one engine of the app, and what the sync UI shows. */
export class SyncClient {
  /** False until `init` has looked for a config. */
  ready = $state(false);
  config = $state.raw<SyncConfig | null>(null);
  /** The deploy preset from /config.json, prefills the connect form. */
  preset = $state.raw<SyncConfig | null>(null);
  session = $state.raw<BackendSession | null>(null);
  /** Null until the server answered. */
  methods = $state.raw<AuthMethod[] | null>(null);
  /** Reactive status of the running engine. */
  engine = $state.raw<SyncEngine | null>(null);
  error = $state<string | null>(null);
  busy = $state(false);

  private adapter: BackendAdapter | null = null;
  private started: Promise<void> | undefined;
  private listeners: ((count: number) => void)[] = [];
  private readonly repo: FlightRepository;
  private readonly load: (id: string) => Promise<BackendPlugin>;
  private readonly engineOpts: SyncOptions;

  constructor(deps: ClientDeps = {}) {
    this.repo = deps.repo ?? flightRepository;
    this.load = deps.loadBackend ?? loadBackend;
    this.engineOpts = deps.engine ?? {};
  }

  /** Never throws, call once at startup. */
  init(): Promise<void> {
    this.started ??= (async () => {
      try {
        const { config, preset } = await loadSyncConfig();
        this.preset = preset;
        if (config) await this.setup(config);
      } catch (e) {
        this.error = message(e);
      } finally {
        this.ready = true;
      }
    })();
    return this.started;
  }

  /** Saves the server as the user's choice and asks it how to sign in. */
  async connect(input: SyncConfig): Promise<void> {
    const config = parseSyncConfig(input);
    if (!config) {
      this.error = 'The backend or the server address is not valid.';
      return;
    }

    writeOverride(config);
    await this.setup(config);
  }

  /** Forgets the server. Local data stays. */
  async disconnect(): Promise<void> {
    this.stopEngine();
    await this.adapter?.signOut().catch(() => {});
    writeOverride(null);
    this.adapter = null;
    this.config = null;
    this.session = null;
    this.methods = null;
    this.error = null;
  }

  /**
   * `adapter.signIn` is called before the first await on purpose: an OAuth popup is only allowed
   * while the click that started it is still the user gesture.
   */
  signIn(method: AuthMethod, input?: Record<string, string>): Promise<void> {
    const adapter = this.adapter;
    if (!adapter || this.busy) return Promise.resolve();

    this.busy = true;
    this.error = null;
    let signing: Promise<BackendSession>;
    try {
      signing = adapter.signIn(method, input);
    } catch (e) {
      signing = Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }

    return this.finishSignIn(adapter, signing);
  }

  async signOut(): Promise<void> {
    this.stopEngine();
    try {
      await this.adapter?.signOut();
      this.session = null;
      await this.loadMethods();
    } catch (e) {
      this.error = message(e);
    }
  }

  /** True when signed in to a server that has a club list. */
  get hasClub(): boolean {
    return !!this.session && !!this.adapter?.club;
  }

  /** Throws when not signed in. */
  clubEntries() {
    if (!this.adapter || !this.session) throw new Error('Sign in to a sync server first.');
    return loadClub(this.adapter);
  }

  clubFlight(key: string) {
    if (!this.adapter || !this.session) throw new Error('Sign in to a sync server first.');
    return loadClubFlight(this.adapter, key);
  }

  syncNow(): Promise<void> {
    return this.engine?.syncNow() ?? Promise.resolve();
  }

  /** Calls `fn` after a pull wrote records. Returns the unsubscribe function. */
  onApplied(fn: (count: number) => void): () => void {
    this.listeners.push(fn);
    return () => void (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  private async finishSignIn(adapter: BackendAdapter, signing: Promise<BackendSession>) {
    try {
      const session = await signing;
      await this.switchAccount(session);
      // Keeps a preset server after sign in, /config.json is not cached, so an offline start would lose it.
      writeOverride(this.config);
      this.session = session;
      this.startEngine(adapter);
      await this.engine?.syncNow();
    } catch (e) {
      this.error = message(e);
    } finally {
      this.busy = false;
    }
  }

  /** A different account must get everything from this device and start pulling from the beginning. */
  private async switchAccount(session: BackendSession) {
    const config = this.config!;
    const account = `${config.backend}|${config.url}|${session.user}`;
    const state = await this.repo.getSyncState();
    if (state.account === account) return;

    await this.repo.markAllDirty();
    await this.repo.setSyncState({ cursor: null, prefs: {}, account });
  }

  private async setup(config: SyncConfig) {
    this.stopEngine();
    this.adapter = null;
    this.config = config;
    this.session = null;
    this.methods = null;
    this.error = null;

    try {
      const adapter = (await this.load(config.backend)).create({ url: config.url });
      this.adapter = adapter;
      this.session = adapter.session();
      if (this.session) this.startEngine(adapter);
      else await this.loadMethods();
    } catch (e) {
      this.error = message(e);
    }
  }

  private async loadMethods() {
    this.methods = await this.adapter!.authMethods();
  }

  private startEngine(adapter: BackendAdapter) {
    this.stopEngine();
    this.engine = new SyncEngine(this.repo, adapter, {
      ...this.engineOpts,
      onApplied: (n) => this.listeners.forEach((fn) => fn(n))
    });
    this.engine.start();
  }

  private stopEngine() {
    this.engine?.stop();
    this.engine = null;
  }
}

export const syncClient = new SyncClient();
