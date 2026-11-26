/**
 * The public contract of the Updraft plugin API, version 2 of the studio kind.
 *
 * This file is self-contained and the single source of truth. The app type-checks its own services against it.
 * Plugins are plain JavaScript modules, so use it from JSDoc, for example
 * `/** @param {import('./updraft-plugin.d.ts').PluginContext} ctx *\/`.
 */
import type { Viewer } from 'cesium';

/** A dock a panel can sit in. The user can move the panel afterwards. */
export type PluginDock = 'left' | 'right' | 'bottom';

/** A page that can show a panel. `'plan'` is the XC planner. */
export type PluginHost = 'studio' | 'plan';

/** Background work a plugin can ask the studio for. `'xc'` scores the flights, `'ground'` loads ground heights. */
export type NeedKind = 'xc' | 'ground';

/** The altitude reference for transition altitudes. */
export type AltRef = 'msl' | 'agl';

/** What a service factory gets. */
export interface ServiceContext {
  /** Another service this one depends on. Built on first use. A cycle throws a clear error. */
  use<T = unknown>(name: string): T;
}

/**
 * Builds a service on its first use. The result is cached and every caller gets the same object.
 * Treat everything a service returns as read only.
 */
export type ServiceFactory = (ctx: ServiceContext) => object;

/** Fields every plugin kind may have. */
export interface PluginBase {
  /**
   * Services this plugin offers, by name `vendor/service@major`, each part matching `[a-z0-9-]{1,40}`.
   * The first provider of a name wins, a second one is refused. The vendor `updraft` is reserved.
   * Removing the plugin removes its services.
   */
  provides?: Record<string, ServiceFactory>;
  /** Services this plugin uses. `ctx.use` only hands out these. */
  requires?: string[];
}

/** What a mounted studio plugin gets. Data comes from services, see `StudioService`. It is frozen. */
export interface PluginContext {
  /**
   * A service named in the plugin's `requires`. Any other name throws `Service "x" is not in requires.`.
   * A missing provider throws too, but the panel is not mounted at all in that case, the user sees which services are missing.
   */
  use<T = unknown>(name: string): T;
  /**
   * A div over the 3D and 2D views, owned by the plugin. It has `position: absolute`, fills the views and has
   * `pointer-events: none`, so clicks pass through. Set `pointer-events: auto` on your own children that need clicks.
   * The studio removes it on unmount. In the planner it covers the map.
   */
  overlay: HTMLDivElement;
  /**
   * Asks the studio to run background work for as long as the plugin is mounted. Returns a release function.
   * Every need is released on unmount. Any other `kind` throws. In the planner it throws `need is not available in the planner.`.
   */
  need(kind: NeedKind): () => void;
}

/** A panel in a dock, apiVersion 2. */
export interface StudioPlugin extends PluginBase {
  /**
   * `vendor/name`, each part matching `[a-z0-9-]{1,40}`, for example `acme/wind-panel`.
   * Unique among plugins and built-in panels. Stable, it identifies the panel in the saved layout.
   * The vendor `updraft` is reserved for bundled plugins.
   */
  id: string;
  /** Not blank. Shown as the panel title, in the Panels menu and in the export dialogs. */
  name: string;
  kind: 'studio';
  /** Must be `2`. Any other value is refused with `Unsupported apiVersion X, this studio supports 2.`. */
  apiVersion: 2;
  /** The dock the panel starts in. */
  dock: PluginDock;
  /** Pages that show the panel, defaults to `['studio']`. A non-empty list without duplicates. */
  hosts?: PluginHost[];
  /**
   * Called when the panel is shown, again with a fresh `el` and `ctx` each time it is shown.
   * `el` is an empty div that fills the panel body. Write to it with `textContent` or DOM calls, not `innerHTML`,
   * when the text comes from flight files. The returned function is called once when the panel is hidden or the
   * plugin is removed. Stop timers, listeners and anything else you started there.
   */
  mount(el: HTMLElement, ctx: PluginContext): void | (() => void);
  /**
   * Paints onto image and video exports. `ctx2d` is the 2D context of the export frame, `time` is the studio
   * playback time of that frame in ms. It must be synchronous, a returned promise is ignored. The frame size is
   * `ctx2d.canvas.width` by `ctx2d.canvas.height`. The canvas state is restored after each plugin.
   * It has no `ctx`, keep the studio service from `mount` in a module variable if you need flight data.
   */
  drawExport?(ctx2d: CanvasRenderingContext2D, time: number): void;
}

/** A headless plugin, apiVersion 1: no panel, it only provides services. */
export interface ServicePlugin extends PluginBase {
  /** Same rules as `StudioPlugin.id`. */
  id: string;
  /** Not blank. */
  name: string;
  kind: 'service';
  /** Must be `1`. */
  apiVersion: 1;
  /** Must not be empty. */
  provides: Record<string, ServiceFactory>;
}

// Backend kind

/** A sync backend, apiVersion 1: headless, the app picks one and syncs through the adapter it creates. */
export interface BackendPlugin extends PluginBase {
  /** Same rules as `StudioPlugin.id`. */
  id: string;
  /** Not blank. */
  name: string;
  kind: 'backend';
  /** Must be `1`. */
  apiVersion: 1;
  /** Builds the adapter for the server at `config.url`. */
  create(config: { url: string }): BackendAdapter;
}

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

/** The four display units. Values from the studio are always SI, convert them for display. */
export interface Units {
  /** Distances: kilometres, miles or nautical miles. */
  distance: 'km' | 'mi' | 'nm';
  /** Altitudes: metres or feet. */
  alt: 'm' | 'ft';
  /** Climb and sink rates: m/s, feet per minute or knots. */
  vario: 'ms' | 'fpm' | 'kt';
  /** Speeds: km/h, mph or knots. */
  speed: 'kmh' | 'mph' | 'kt';
}

/** One pilot in the studio. */
export interface PluginFlight {
  /** Flight id, the value for `StudioService.selectedId()` and `select()`. */
  readonly id: string;
  /** Pilot name. */
  readonly pilot: string;
  /** Glider, if the file has one. */
  readonly glider: string | null;
  /** The pilot colour as a CSS colour. */
  readonly color: string;
  /** Whether the pilot is shown. */
  readonly visible: boolean;
  /**
   * Track points sorted by time. `t` is in ms on the studio clock, so time shifts of the pilot are already applied.
   * `lat` and `lon` are degrees, `alt` is metres. Shared with the studio, do not modify it or its objects.
   */
  readonly fixes: readonly { t: number; lat: number; lon: number; alt: number }[];
}

/** Events of `StudioService.on`. */
export type StudioEvent =
  /** The playback time changed. */
  | 'time'
  /** The pilot list changed: a flight was added or removed, or a color, visibility or time shift changed. */
  | 'flights'
  /** The selected pilot changed. */
  | 'selection'
  /** The user changed the display units. */
  | 'units'
  /** The user changed the altitude reference. */
  | 'altRef';

/**
 * Service `updraft/studio@1`. Provided by the studio while it is open, not by the planner.
 * Every value is read through a function, so it is always current. Call the function again instead of keeping its result.
 */
export interface StudioService {
  /**
   * Calls `fn` after the named event fired, at most once per animation frame. `fn` gets no payload, read the
   * current values through the functions of this service. It does not fire for the state at the time you subscribe,
   * so call your draw once yourself. Returns a function that stops it. Inside a plugin, every subscription made
   * through a service from `ctx.use` also stops on its own when the plugin unmounts. An unknown event throws
   * `Unknown event "x" of updraft/studio@1.`.
   */
  on(event: StudioEvent, fn: () => void): () => void;
  /** All pilots in the studio, in list order. The same frozen array until flights, colors or visibility change. */
  flights(): readonly PluginFlight[];
  /** Playback time in ms on the studio clock. */
  time(): number;
  /** Id of the selected pilot, or null. */
  selectedId(): string | null;
  /** The display units the user chose. The same frozen object until the user changes them. */
  units(): Readonly<Units>;
  /** The altitude reference the user chose for transition altitudes. */
  altRef(): AltRef;
  /** Moves playback to `ms` on the studio clock. The studio clamps it to the playable range. */
  seek(ms: number): void;
  /** Selects the pilot with that flight id. An unknown id is ignored. */
  select(id: string): void;
  /** The Cesium viewer. Null while there is no 3D view, for example in the 2D map, so check it every time. */
  viewer(): Viewer | null;
}

/** Statistics of one flight. All values are SI. */
export interface FlightStats {
  /** Seconds. */
  duration: number;
  /** Metres along the track. */
  trackLength: number;
  /** Metres, straight line takeoff to landing. */
  straightDistance: number;
  /** Metres, furthest point from takeoff. */
  maxDistanceFromTakeoff: number;
  maxAlt: number;
  minAlt: number;
  takeoffAlt: number;
  landingAlt: number;
  maxClimb: number;
  maxSink: number;
  /** Share of time per phase, 0..1. */
  phaseShare: Record<'thermalling' | 'gliding' | 'searching', number>;
  /** Average glide ratio over gliding phases, null if none. */
  glideRatio: number | null;
}

/** Transition altitudes: where climbs were left and the next one found. Glides only. */
export interface TransitionSummary {
  count: number;
  avgStartAlt: number | null;
  avgEndAlt: number | null;
  lowestArrival: number | null;
  avgGlideRatio: number | null;
  /** m/s. */
  avgSpeed: number | null;
}

/** Events of `AnalysisService.on`. */
export type AnalysisEvent =
  /** Flights changed or ground heights arrived, so stats and transitions may differ. */
  'changed';

/**
 * Service `updraft/flight-analysis@1`. Provided by the studio while it is open, not by the planner.
 * Lookups are by flight id and return null for an unknown id. Results are the studio's own objects, read only.
 */
export interface AnalysisService {
  /**
   * Calls `fn` after the named event fired, at most once per animation frame. `fn` gets no payload, read the
   * current values through the functions of this service. It does not fire for the state at the time you subscribe,
   * so call your draw once yourself. Returns a function that stops it. Inside a plugin, every subscription made
   * through a service from `ctx.use` also stops on its own when the plugin unmounts. An unknown event throws
   * `Unknown event "x" of updraft/flight-analysis@1.`.
   */
  on(event: AnalysisEvent, fn: () => void): () => void;
  /** Duration, distances, altitudes, max climb and sink, glide ratio and phase shares of the flight. */
  stats(id: string): FlightStats | null;
  /**
   * Summary of the glides between climbs, with altitudes in `'msl'` or `'agl'`.
   * AGL values are null until ground heights have loaded, so hold `ctx.need('ground')` while asking for them.
   */
  transitions(id: string, ref: AltRef): TransitionSummary | null;
}

/** Events of `PlanService.on`. */
export type PlanEvent =
  /** The route changed. */
  | 'route'
  /** The planned speed changed. */
  | 'speed'
  /** The user changed the display units. */
  | 'units';

/**
 * Service `updraft/plan@1`. Provided by the planner while it is open, not by the studio.
 * Everything is read through functions, so it is always current.
 */
export interface PlanService {
  /**
   * Calls `fn` after the named event fired, at most once per animation frame. `fn` gets no payload, read the
   * current values through the functions of this service. It does not fire for the state at the time you subscribe,
   * so call your draw once yourself. Returns a function that stops it. Inside a plugin, every subscription made
   * through a service from `ctx.use` also stops on its own when the plugin unmounts. An unknown event throws
   * `Unknown event "x" of updraft/plan@1.`.
   */
  on(event: PlanEvent, fn: () => void): () => void;
  /** The route. The same frozen array until the route changes. */
  points(): readonly Readonly<{ lat: number; lon: number }>[];
  /** Route length in m. */
  distance(): number;
  /** Planned speed in km/h. */
  speed(): number;
  /** The same frozen object until the user changes units. */
  units(): Readonly<Units>;
}
