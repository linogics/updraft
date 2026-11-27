import { clubFlightOf, loadClubFeed, type ValidClubEntry } from '#lib/club';
import type { Fix, Flight } from '#lib/domain/model';
import { flightRepository } from '#lib/storage';
import type { IndexedDbFlightRepository } from '#lib/storage/indexeddb';

import { loadSyncConfig, parseSyncConfig, type SyncConfig, writeOverride } from './config';
import { SyncEngine, type SyncOptions } from './engine.svelte';
import type { AuthMethod } from './types';
import { SessionStore, signInWithPopup, type StoredSession } from './v2/auth';
import { type Capabilities, type Club, SyncApi } from './v2/http';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SIGNED_OUT = 'Signed out, sign in again.';

export interface ClientDeps {
  repo?: IndexedDbFlightRepository;
  engine?: SyncOptions;
  /** Replaced in tests, for the fetch and the retry wait of the HTTP client. */
  api?: Pick<ConstructorParameters<typeof SyncApi>[0], 'fetch' | 'sleep'>;
}

/** Fixes of a track file come from the network, so each one is checked. */
export function parseFixes(raw: unknown[]): Fix[] {
  const fixes = raw.map((f) => {
    const o = f as Record<string, unknown> | null;
    if (!o || ![o.t, o.lat, o.lon, o.alt].every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new Error('The track is not valid.');
    }

    return { t: o.t as number, lat: o.lat as number, lon: o.lon as number, alt: o.alt as number };
  });
  if (!fixes.length) throw new Error('The track is not valid.');
  return fixes.sort((a, b) => a.t - b.t);
}

/** Owns the one server connection and the one engine of the app, and what the sync UI shows. */
export class SyncClient {
  /** False until `init` has looked for a config. */
  ready = $state(false);
  config = $state.raw<SyncConfig | null>(null);
  /** The deploy preset from /config.json, prefills the connect form. */
  preset = $state.raw<SyncConfig | null>(null);
  session = $state.raw<{ user: string } | null>(null);
  /** Null until the server answered. */
  capabilities = $state.raw<Capabilities | null>(null);
  /** The clubs of the signed in pilot. Empty without club support. */
  clubs = $state.raw<Club[]>([]);
  /** Reactive status of the running engine. */
  engine = $state.raw<SyncEngine | null>(null);
  error = $state<string | null>(null);
  busy = $state(false);

  private api: SyncApi | null = null;
  private store: SessionStore | null = null;
  private started: Promise<void> | undefined;
  private listeners: ((count: number) => void)[] = [];
  private readonly repo: IndexedDbFlightRepository;
  private readonly engineOpts: SyncOptions;
  private readonly apiOpts: ClientDeps['api'];

  constructor(deps: ClientDeps = {}) {
    this.repo = deps.repo ?? flightRepository;
    this.engineOpts = deps.engine ?? {};
    this.apiOpts = deps.api;
  }

  /** How a pilot can sign in, from the capabilities. Null until the server answered. */
  get methods(): AuthMethod[] | null {
    const auth = this.capabilities?.auth;
    if (!auth) return null;

    const out: AuthMethod[] = [];
    if (auth.password) out.push({ kind: 'password' });
    for (const p of auth.oauth) out.push({ kind: 'redirect', id: p.id, label: p.label });
    return out;
  }

  get canSignUp(): boolean {
    return this.capabilities?.auth.signup === true;
  }

  /** True when signed in to a server that offers clubs. The pilot may still belong to none. */
  get hasClub(): boolean {
    return !!this.session && this.capabilities?.clubs === true;
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
      this.error = 'The server address is not valid.';
      return;
    }

    writeOverride(config);
    await this.setup(config);
  }

  /** Forgets the server. Local data stays. */
  disconnect(): void {
    this.stopEngine();
    this.store?.set(null);
    writeOverride(null);
    this.reset(null);
  }

  /**
   * The popup of an OAuth sign in is started before the first await on purpose: it is only allowed
   * while the click that started it is still the user gesture.
   */
  signIn(method: AuthMethod, input?: Record<string, string>): Promise<void> {
    const api = this.api;
    if (!api || this.busy) return Promise.resolve();

    this.busy = true;
    this.error = null;
    let signing: Promise<StoredSession>;
    try {
      signing =
        method.kind === 'redirect'
          ? signInWithPopup(api, method.id)
          : api.signInWithPassword(input?.identity ?? '', input?.password ?? '').then(toStored);
    } catch (e) {
      signing = Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }

    return this.finishSignIn(signing);
  }

  /** Creates an account and signs in, like the password path of `signIn`. */
  signUp(input: { email: string; password: string }): Promise<void> {
    const api = this.api;
    if (!api || !this.canSignUp || this.busy) return Promise.resolve();

    this.busy = true;
    this.error = null;
    return this.finishSignIn(api.signUp(input.email, input.password).then(toStored));
  }

  signOut(): void {
    this.stopEngine();
    this.store?.set(null);
    this.session = null;
    this.clubs = [];
  }

  syncNow(): Promise<void> {
    return this.engine?.syncNow() ?? Promise.resolve();
  }

  /** Calls `fn` after a pull wrote records. Returns the unsubscribe function. */
  onApplied(fn: (count: number) => void): () => void {
    this.listeners.push(fn);
    return () => void (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  /** The shared flights of one club, read from the start. Throws when not signed in. */
  clubEntries(clubId: string): Promise<ValidClubEntry[]> {
    const api = this.signedInApi();
    return loadClubFeed((since) => api.listClubFlights(clubId, since, this.maxPage()));
  }

  /** One shared flight with its track, for the studio. */
  async clubFlight(clubId: string, key: string): Promise<Flight> {
    const api = this.signedInApi();
    const entry = (await this.clubEntries(clubId)).find((e) => e.key === key);
    if (!entry) throw new Error('The shared flight was not found.');

    return clubFlightOf(entry, parseFixes(await api.getClubTrackJson(clubId, key)));
  }

  /** Downloads the track of a flight that came from another device and keeps it. Throws when it cannot. */
  async fetchTrack(id: string): Promise<Fix[]> {
    const fixes = parseFixes(await this.signedInApi().getTrackJson(id));
    await this.repo.storeTrack(id, fixes);
    return fixes;
  }

  private signedInApi(): SyncApi {
    if (!this.api || !this.session) throw new Error('Sign in to a sync server first.');
    return this.api;
  }

  private maxPage() {
    return this.capabilities?.limits.maxPage ?? 100;
  }

  private async finishSignIn(signing: Promise<StoredSession>) {
    try {
      const session = await signing;
      this.store?.set(session);
      await this.switchAccount(session);
      // Keeps a preset server after sign in, /config.json is not cached, so an offline start would lose it.
      writeOverride(this.config);
      this.session = { user: session.user };
      await this.refreshClubs();
      this.startEngine();
      await this.engine?.syncNow();
    } catch (e) {
      this.error = message(e);
    } finally {
      this.busy = false;
    }
  }

  /** A different account must get everything from this device and start pulling from the beginning. */
  private async switchAccount(session: StoredSession) {
    const account = `${this.config!.url}|${session.user}`;
    const state = await this.repo.getSyncState();
    if (state.account === account) return;

    await this.repo.markAllDirty();
    await this.repo.setSyncState({ cursors: {}, account });
  }

  private reset(config: SyncConfig | null) {
    this.stopEngine();
    this.config = config;
    this.session = null;
    this.capabilities = null;
    this.clubs = [];
    this.error = null;
    if (!config) {
      this.api = null;
      this.store = null;
    }
  }

  private async setup(config: SyncConfig) {
    this.reset(config);
    const store = new SessionStore(config.url);
    this.store = store;
    this.api = new SyncApi({
      ...this.apiOpts,
      url: config.url,
      token: () => store.get()?.token ?? null,
      onUnauthorized: () => this.signedOut()
    });

    try {
      const stored = store.get();
      if (stored) {
        // The club offer is part of the capabilities, so ask before the UI looks for it. Offline is fine.
        this.capabilities = await this.api.capabilities().catch(() => null);
        this.session = { user: stored.user };
        await this.refreshClubs();
        this.startEngine();
      } else {
        this.capabilities = await this.api.capabilities();
      }
    } catch (e) {
      this.error = message(e);
    }
  }

  /** The server refused the token, so it is forgotten and the pilot signs in again. */
  private signedOut() {
    this.stopEngine();
    this.store?.set(null);
    this.session = null;
    this.clubs = [];
    this.error = SIGNED_OUT;
    void this.api
      ?.capabilities()
      .then((c) => (this.capabilities = c))
      .catch(() => {});
  }

  /** Asks the server for the clubs of the pilot. */
  async refreshClubs() {
    if (!this.session || this.capabilities?.clubs !== true) {
      this.clubs = [];
      return;
    }

    // A server that fails here still syncs, the club just stays hidden.
    this.clubs = await this.api!.listClubs().catch(() => []);
  }

  private startEngine() {
    this.stopEngine();
    this.engine = new SyncEngine(this.repo, this.api!, {
      maxPage: this.maxPage(),
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

const toStored = (s: { token: string; user: { name: string } }): StoredSession => ({
  token: s.token,
  user: s.user.name
});

export const syncClient = new SyncClient();
