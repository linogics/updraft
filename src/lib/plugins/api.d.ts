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
 * Treat everything a service returns as read only. A service may also offer write functions, documented per
 * service. The data they return stays read only.
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

/** Kind `studio`. A panel in a dock, apiVersion 2. */
export interface StudioPlugin extends PluginBase {
  /**
   * `vendor/name`, each part matching `[a-z0-9-]{1,40}`, for example `acme/wind-panel`.
   * Unique among plugins and built-in panels. Stable, it identifies the panel in the saved layout.
   * The vendor `updraft` is reserved for bundled plugins.
   */
  id: string;
  /** Not blank. Shown as the panel title, in the Panels menu and in the export dialogs. */
  name: string;
  /** Must be `'studio'`. */
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

/** Kind `service`. A headless plugin, apiVersion 1: no panel, it only provides services. */
export interface ServicePlugin extends PluginBase {
  /** `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. */
  id: string;
  /** Not blank. */
  name: string;
  /** Must be `'service'`. */
  kind: 'service';
  /** Must be `1`. */
  apiVersion: 1;
  /** Must not be empty. */
  provides: Record<string, ServiceFactory>;
}

// Converter kind

/** A track as plugins see it. Times in Unix ms, altitude in m, positions in degrees. */
export interface PluginTrack {
  /** Pilot name. */
  pilot: string;
  /** Glider name, or null when unknown. */
  glider: string | null;
  /** Takeoff site name, or null when unknown. */
  site: string | null;
  /** Flight date, `YYYY-MM-DD`. */
  date: string;
  /** At least one fix, `t` never decreasing. */
  fixes: readonly Readonly<{ t: number; lat: number; lon: number; alt: number }>[];
}

/**
 * Kind `converter`. One track file format, apiVersion 1. A plugin reads and/or writes its format, the app converts through its own
 * flight model. Data that `PluginTrack` has no field for is lost.
 */
export interface ConverterPlugin extends PluginBase {
  /** `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. */
  id: string;
  /** Not blank. */
  name: string;
  /** Must be `'converter'`. */
  kind: 'converter';
  /** Must be `1`. */
  apiVersion: 1;
  /** Format name shown to the user, for example `IGC`. Not blank. */
  label: string;
  /**
   * Lower case file extensions without the dot, 1 to 10 characters from `[a-z0-9]`, no duplicates.
   * The first one is used for written files. An extension already handled by another converter is refused.
   */
  extensions: string[];
  /** Media type of written files. Defaults to `application/octet-stream`. */
  mime?: string;
  /** Parses a file. Throw an Error with a message for the user when it is not valid. The app validates the result. */
  read?(file: File): PluginTrack | Promise<PluginTrack>;
  /** Builds the file content. Text is stored as UTF-8. */
  write?(track: PluginTrack): string | Uint8Array;
}

// XC planner kind

/** A planned route as export plugins get it. */
export interface PlanRoute {
  /** Turnpoints in order, at least 2. */
  points: readonly Readonly<{ lat: number; lon: number }>[];
  /** Planned speed in km/h. */
  speed: number;
}

/** One file format a planned route can be saved as. */
export interface PlanExport {
  /** Shown on the export button, for example `XCTrack task`. Not blank. */
  label: string;
  /** Lower case file extension without the dot, 1 to 10 characters from `[a-z0-9]`. */
  extension: string;
  /** Media type of the file. Defaults to `application/octet-stream`. */
  mime?: string;
  /** Builds the file content. Text is stored as UTF-8. */
  write(route: PlanRoute): string | Uint8Array;
}

/** One route type a league scores. */
export interface LeagueRule {
  /** Shown to the user, for example `FAI triangle`. Not blank. */
  name: string;
  /**
   * `free`: distance via up to 3 turnpoints. `flat`: triangle. `fai`: FAI triangle.
   * `oar`: out-and-return via 1 turnpoint. `oar2`: out-and-return via 2 turnpoints.
   */
  type: 'free' | 'flat' | 'fai' | 'oar' | 'oar2';
  /** Points per km, greater than 0, at most 10. */
  multiplier: number;
  /** Shortest side of a triangle as a share of the total, greater than 0 and below 0.5. `fai` only defaults to 0.28, `flat` has none unless set. */
  minSide?: number;
  /** Longest side of a triangle as a share of the total, between 0 and 1, `flat` only. Must be above `minSide`. */
  maxSide?: number;
  /** Shortest route in km that scores at all, 0 to 1000. */
  minDistance?: number;
  /**
   * Closing gap allowed for triangles and out-and-returns, all in km, each 0 to 100 and `relative` 0 to 1.
   * The gap is max(fixed, relative * route length). Not for `free`.
   */
  closing?: { fixed?: number; free?: number; relative?: number };
  /** FAI cylinders in km, 0 to 5. Turnpoints are moved out by this radius. */
  cylinders?: number;
  /** Decimals of the final score, 1 or 2, default 2. */
  decimals?: 1 | 2;
}

/** A scoring league made of declarative rules, so scoring never runs plugin code. */
export interface PlanLeague {
  /** Unique within the plugin, `[a-z0-9-]{1,40}`. The app stores it as `<plugin id>:<id>`. */
  id: string;
  /** Shown in the league pickers. Not blank. */
  label: string;
  /** 1 to 10 rules, the best scoring one wins. */
  rules: LeagueRule[];
}

/** Kind `xc-planner`. An extension of the XC planner, apiVersion 1: headless, it adds export buttons and scoring leagues. */
export interface XcPlannerPlugin extends PluginBase {
  /** `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. */
  id: string;
  /** Not blank. */
  name: string;
  /** Must be `'xc-planner'`. */
  kind: 'xc-planner';
  /** Must be `1`. */
  apiVersion: 1;
  /** Task file formats, 1 to 10. Extensions must be unique within the plugin, other plugins may reuse them. */
  exports?: PlanExport[];
  /** XC scoring leagues, 1 to 20. They apply everywhere the app scores. At least one of `exports` and `leagues` is needed. */
  leagues?: PlanLeague[];
}

// Badge kind

/** The quantity a badge measures. Thresholds and values are SI: metres, m/s, seconds, or a plain count. */
export type BadgeUnit = 'distance' | 'speed' | 'duration' | 'altitude' | 'vario' | 'count';

/** One flight as badges see it. Everything is SI, so convert for display only. */
export interface BadgeFlight {
  /** Flight date, `YYYY-MM-DD`. */
  date: string;
  /** Takeoff site name, or null when unknown. May be blank or differ in case between flights. */
  site: string | null;
  /** Glider name, or null when unknown. May be blank or differ in case between flights. */
  glider: string | null;
  /** Airtime in seconds. */
  durationS: number;
  /** Free distance in metres, the furthest of the free route and the distance from takeoff. */
  freeDistance: number;
  /** Highest altitude in metres above sea level. */
  maxAltMsl: number;
  /** Highest altitude minus takeoff altitude, in metres. */
  maxGain: number;
  /** Highest height above ground in metres. Missing when no ground heights were available. */
  maxAgl?: number;
  /** Best average climb of one thermal in m/s. */
  bestClimb: number;
  /** Biggest altitude gain of one thermal in metres. */
  bestThermalGain: number;
  /** The best scored route of the flight, missing when none scored. */
  xc?: {
    /** Route type: `free`, `flat` (flat triangle), `fai` (FAI triangle), `oar` or `oar2` (out-and-return). */
    kind: string;
    /** Route length in metres. */
    distance: number;
    /** Average speed in m/s from the first to the last route point. Missing for closed routes. */
    speed?: number;
  };
}

/** One tiered achievement. The tier is the highest threshold that `value` reaches. */
export interface BadgeDef {
  /** Unique within the plugin, `[a-z0-9-]{1,40}`. */
  id: string;
  /** Shown to the user, for example `Longest flight`. Not blank. */
  label: string;
  /** The quantity the badge measures, it tells the app how to display the value. */
  unit: BadgeUnit;
  /**
   * The values for Bronze, Silver, Gold, Platinum, Diamond, Cloudbase, Stratos and Legend, in that order.
   * Exactly 8 finite numbers above 0, strictly increasing, in the SI unit of `unit`.
   */
  thresholds: number[];
  /**
   * The badge value over all flights of a pilot, in any order. Return a finite number of 0 or more.
   * It must never drop when a flight is added, like a maximum or a count. Anything else counts as 0.
   */
  value(flights: BadgeFlight[]): number;
}

/** Kind `badge`. A set of badges, apiVersion 1: headless, the app shows the tiers a pilot reached. */
export interface BadgePlugin extends PluginBase {
  /** `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. */
  id: string;
  /** Not blank. */
  name: string;
  /** Must be `'badge'`. */
  kind: 'badge';
  /** Must be `1`. */
  apiVersion: 1;
  /** 1 or more, ids unique within the plugin. */
  badges: BadgeDef[];
}

// Backend kind

/** Kind `backend`. A sync backend, apiVersion 1: headless, the app picks one and syncs through the adapter it creates. */
export interface BackendPlugin extends PluginBase {
  /** `vendor/name`, each part matching `[a-z0-9-]{1,40}`. Unique among plugins. The vendor `updraft` is reserved for bundled plugins. */
  id: string;
  /** Not blank. */
  name: string;
  /** Must be `'backend'`. */
  kind: 'backend';
  /** Must be `1`. */
  apiVersion: 1;
  /** Builds the adapter for the server at `config.url`. */
  create(config: { url: string }): BackendAdapter;
}

export type SyncType = 'flight' | 'manual' | 'cameraPath' | 'pref';

/** One record version. `data` is the Flight, the manual FlightSummary, `{ key, tracks }` or the pref value. */
export interface SyncChange {
  /** What the record is. */
  type: SyncType;
  /** Record id, unique within its `type`. */
  id: string;
  /** Client clock in ms. The higher value wins per whole record. */
  updatedAt: number;
  /** Set for a deleted record, which has no `data`. */
  deleted?: true;
  /** The record content, absent when `deleted` is set. */
  data?: unknown;
}

/** Login and auth are the transport's own business. */
export interface SyncTransport {
  /** Stores the changes. A change only replaces the stored record when its `updatedAt` is higher. */
  push(changes: SyncChange[]): Promise<void>;
  /**
   * Returns the changes after an opaque `cursor`, `null` for the start, in a stable order. `more` is true while
   * there are further pages. Only the signed in account's own records, never shared flights of other pilots.
   */
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
  /** Whether the flight belongs to the signed in account. */
  mine: boolean;
  /** The club summary of the flight record. Untrusted. */
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
  /** What the server offers for signing in. */
  authMethods(): Promise<AuthMethod[]>;
  /** A `redirect` method opens a popup, so call this from a user gesture. */
  signIn(method: AuthMethod, input?: Record<string, string>): Promise<BackendSession>;
  /** Creates an account and signs in, same result as `signIn`. Leave it out when the server does not allow signup. */
  signUp?(input: { email: string; password: string }): Promise<BackendSession>;
  /** Ends the session and forgets the token. */
  signOut(): Promise<void>;
  /** The stored session, survives a reload. */
  session(): BackendSession | null;
  /** Shared flights of all pilots. Leave it out when the backend has no club. */
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
  /** The pilot list changed: a flight was added or removed, or a color, visibility (also `setVisible`) or time shift changed. */
  | 'flights'
  /** The selected pilot changed. */
  | 'selection'
  /** The user changed the display units. */
  | 'units'
  /** The user changed the altitude reference. */
  | 'altRef'
  /** The scoring league changed. */
  | 'league'
  /** Playback started or stopped. */
  | 'playing'
  /** The effective range changed: the timeline marks, or the studio start and end while they are unset. */
  | 'range'
  /** The 3D view appeared or went away, so `viewer()` returns a different value. */
  | 'viewer';

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
  /**
   * Shows or hides the pilot with that flight id. An unknown id is ignored. Anything but a boolean throws
   * `Visible must be true or false.`. Fires `flights`.
   */
  setVisible(id: string, visible: boolean): void;
  /** Id of the scoring league in use. Plugin leagues are `<plugin id>:<league id>`. `XContest` when the chosen one was removed. */
  league(): string;
  /** All scoring leagues, bundled and from plugins. The same frozen array until the list changes. */
  leagues(): readonly Readonly<{ id: string; label: string }>[];
  /**
   * Switches the scoring league like the user would, so scores of the old league are dropped and scoring restarts.
   * An unknown id throws `Unknown league "x".`. The current league is a no-op.
   */
  setLeague(id: string): void;
  /** Starts playback. A no-op while playing. At the end it starts again from the beginning. */
  play(): void;
  /** Stops playback. A no-op while paused. */
  pause(): void;
  /** Whether playback is running. */
  playing(): boolean;
  /**
   * The in and out marks of the timeline, which set the video export range, in ms on the studio clock.
   * Unset marks read as the studio start and end. The same frozen object until a mark or the studio range changes.
   */
  range(): Readonly<{ start: number; end: number }>;
  /**
   * Sets both marks. Both must be finite numbers with `start` before `end`, otherwise it throws
   * `Range start and end must be finite numbers.` or `Range start must be before end.`.
   * Values outside the studio range are clamped into it first, and the clamped values must still be in order, so a range entirely outside the studio throws `Range start must be before end.` too.
   */
  setRange(start: number, end: number): void;
  /** Removes both marks, so the export covers the whole studio range. */
  clearRange(): void;
  /** The Cesium viewer. Null while there is no 3D view, for example in the 2D map. The `viewer` event fires when it changes. */
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
  /** Highest altitude in metres. */
  maxAlt: number;
  /** Lowest altitude in metres. */
  minAlt: number;
  /** Altitude at takeoff in metres. */
  takeoffAlt: number;
  /** Altitude at landing in metres. */
  landingAlt: number;
  /** Best climb rate in m/s. */
  maxClimb: number;
  /** Worst sink rate in m/s, a negative number. */
  maxSink: number;
  /** Share of time per phase, 0..1. */
  phaseShare: Record<'thermalling' | 'gliding' | 'searching', number>;
  /** Average glide ratio over gliding phases, null if none. */
  glideRatio: number | null;
}

/** Transition altitudes: where climbs were left and the next one found. Glides only. */
export interface TransitionSummary {
  /** Number of glides. */
  count: number;
  /** Average altitude where the glides started, in metres. Null when there is none. */
  avgStartAlt: number | null;
  /** Average altitude where the glides ended, in metres. Null when there is none. */
  avgEndAlt: number | null;
  /** Lowest altitude where a glide ended, in metres. Null when there is none. */
  lowestArrival: number | null;
  /** Average glide ratio of the glides. Null when there is none. */
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
  | 'units'
  /** The XC scoring league changed. */
  | 'league';

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
  /**
   * Replaces the whole route. The user can undo it in the planner, as one step. An empty array clears the route.
   * Throws when the argument is not an array, has more than 100 points, or a point lacks a finite `lat` in
   * [-90, 90] or `lon` in [-180, 180]. The points are copied.
   */
  setRoute(points: readonly { lat: number; lon: number }[]): void;
  /** Id of the active XC scoring league. Plugin leagues are `<plugin id>:<league id>`. `XContest` when the chosen one was removed. */
  league(): string;
  /** The leagues the user can pick. The same frozen array until the list changes. */
  leagues(): readonly Readonly<{ id: string; label: string }>[];
  /** Switches the XC league for the whole app, it is a global preference. An unknown id throws `Unknown league "x".`. */
  setLeague(id: string): void;
}
