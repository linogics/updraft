import type { Viewer } from 'cesium';
import type { BeginCapture } from '#lib/cesium/capture';
import { DEFAULT_TRACKS, type CameraTracks, type CameraView } from '#lib/domain/cameraPath';
import { analyzeFlight } from '#lib/domain/analysis/analyze';
import { DEFAULT_FILTER, filterThermals, type ThermalFilter } from '#lib/domain/analysis/filter';
import {
  climbKinds,
  extractTransitions,
  summarizeTransitions,
  type Transition,
  type TransitionSummary
} from '#lib/domain/analysis/transitions';
import type { Flight, FlightAnalysis, PhaseKind, Thermal } from '#lib/domain/model';
import {
  DEFAULT_SCENE,
  type BasemapId,
  type CameraMode,
  type ColorMode,
  type Layout,
  type TerrainSource,
  type TrackStyle
} from '#lib/domain/scene';
import { defaultSyncMode, shiftFixes, syncOffsets, type SyncMode } from '#lib/domain/sync';
import { indexAt } from '#lib/domain/timeline';
import { groundSeries } from '#lib/map/groundHeights';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';
import { flightRepository } from '#lib/storage';
import { pilotColor } from '#lib/ui/colors';
import { scoreFlight, type XcScore } from '#lib/xc/score';
import { yieldToMain } from '#lib/ui/yield';

/** Work that only runs while a view asks for it, see StudioState.need. */
export type NeedKind = 'xc' | 'ground';

/** Camera edits wait this long after the last change before they are stored, ms. */
const CAMERA_SAVE_DELAY = 300;
/** Camera edits kept for undo. */
const UNDO_LIMIT = 50;

/** Climbs that pass the thermal filter. Index-based, like the analysis. */
export interface Climbs {
  thermals: Thermal[];
  /** Glides between the filtered thermals. */
  transitions: Transition[];
  summary: TransitionSummary;
  /** Per-fix climb / transition phase, for the 'climb' colour mode. */
  kinds: PhaseKind[];
}

export interface LoadedFlight {
  /** Flight as stored, real timestamps. */
  source: Flight;
  /** Flight on the playback clock: source fixes shifted by timeOffset. */
  flight: Flight;
  /** Shift from real time to playback time, ms (sync mode + manual nudge). */
  timeOffset: number;
  /** Indices and durations only, so it is valid for source and shifted flight alike. */
  analysis: FlightAnalysis;
  climbs: Climbs;
  color: string;
  visible: boolean;
  /** Vertical correction applied in 3D, metres (terrain alignment + manual). */
  altOffset: number;
  /** Ground height under each source fix, metres MSL. Undefined until loaded. */
  ground?: Float32Array;
  /** XC score for the current league. Undefined while scoring, null when nothing could be scored. */
  xc?: XcScore | null;
}

export const SPEEDS = [1, 5, 10, 25, 50, 100, 200] as const;

export interface SceneInit {
  syncMode?: SyncMode | null;
  nudges?: Record<string, number>;
  thermalFilter?: ThermalFilter;
  colors?: Record<string, string>;
}

/**
 * Studio state shared by all views. The playback clock lives here (not in Cesium) so the
 * 2D-only layout keeps playing without a 3D viewer mounted.
 */
export class StudioState {
  // Raw (not deeply reactive): tracks hold tens of thousands of fixes. Replace the array to update.
  flights = $state.raw<LoadedFlight[]>([]);
  /** Unix ms on the playback clock. */
  time = $state(0);
  playing = $state(false);
  speed = $state<number>(25);
  selectedId = $state<string | null>(null);
  camera = $state<CameraMode>(DEFAULT_SCENE.camera);
  colorBy = $state<ColorMode>(DEFAULT_SCENE.colorBy);
  layout = $state<Layout>(DEFAULT_SCENE.layout);
  basemap = $state<BasemapId>(DEFAULT_SCENE.basemap);
  terrain = $state<TerrainSource>('terrarium');
  /** Whether a Cesium ion token is configured (ion terrain selectable). */
  ionAvailable = $state(false);
  syncMode = $state<SyncMode>('real');
  /** Manual time shift per flight id on top of the sync mode, ms. */
  nudges = $state.raw<Record<string, number>>({});
  thermalFilter = $state.raw<ThermalFilter>(DEFAULT_FILTER);
  trackStyle = $state<TrackStyle>(DEFAULT_SCENE.trackStyle);
  trackWidth = $state(DEFAULT_SCENE.trackWidth);
  smoothTrack = $state(DEFAULT_SCENE.smoothTrack);
  exaggeration = $state(DEFAULT_SCENE.exaggeration);
  lighting = $state(DEFAULT_SCENE.lighting);
  labels = $state(DEFAULT_SCENE.labels);
  /** Pilot colours picked by the user, per flight id. */
  colorOverrides = $state.raw<Record<string, string>>({});
  /** The Cesium viewer while the 3D view is mounted, for plugins. */
  viewer = $state.raw<Viewer | null>(null);
  /** The element that holds the 3D and 2D views, plugin overlays go inside it. */
  viewsEl = $state.raw<HTMLElement | null>(null);
  /** Renders the 3D frame at a size. Null until the 3D viewer is ready. */
  capture = $state.raw<((w: number, h: number) => Promise<HTMLCanvasElement>) | null>(null);
  /** Starts a frame-by-frame capture session for video export. Null until the 3D viewer is ready. */
  beginCapture = $state.raw<BeginCapture | null>(null);
  /** Video export range marks, Unix ms. Null means studio start or end. */
  exportIn = $state<number | null>(null);
  exportOut = $state<number | null>(null);
  /** Camera tracks for 'keys' mode. Stored per set of flights on this device. */
  cameraTracks = $state.raw<CameraTracks>(DEFAULT_TRACKS);
  /** Camera view of the selected pilot now. Null until the 3D viewer is ready or no pilot is shown. */
  captureCameraView = $state.raw<(() => CameraView | null) | null>(null);
  private undoStack = $state.raw<CameraTracks[]>([]);
  private redoStack = $state.raw<CameraTracks[]>([]);
  canUndoCamera = $derived(this.undoStack.length > 0);
  canRedoCamera = $derived(this.redoStack.length > 0);

  start = $derived(this.flights.length ? Math.min(...this.flights.map((f) => f.flight.fixes[0].t)) : 0);
  end = $derived(this.flights.length ? Math.max(...this.flights.map((f) => f.flight.fixes.at(-1)!.t)) : 0);
  selected = $derived(this.flights.find((f) => f.flight.id === this.selectedId) ?? this.flights[0]);
  /** True when flights start on different days, i.e. alignment matters. */
  multiDay = $derived(defaultSyncMode(this.flights.map((f) => f.source.fixes)) === 'timeOfDay');

  private frame = 0;
  private lastTick = 0;
  private cameraSaveTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingCameraSave: (() => void) | undefined;

  setFlights(flights: Flight[], init: SceneInit = {}) {
    // Camera tracks belong to the previous set of flights: save them, then start from the defaults.
    this.persistCameraTracks();
    this.cameraTracks = DEFAULT_TRACKS;
    this.undoStack = [];
    this.redoStack = [];
    this.syncMode = init.syncMode ?? defaultSyncMode(flights.map((f) => f.fixes));
    this.nudges = init.nudges ?? {};
    this.thermalFilter = init.thermalFilter ?? DEFAULT_FILTER;
    this.colorOverrides = init.colors ?? {};
    const offsets = this.offsets(flights);
    this.flights = flights.map((source, i) => this.load(source, offsets[i], i));
    this.selectedId = flights[0]?.id ?? null;
    this.time = this.start;
    this.flightsGen++;
    this.restart('ground');
    this.restart('xc');
  }

  /**
   * Adds flights that are not loaded yet. Time, selection, alignment mode, nudges, colours and the thermal
   * filter stay. Ground heights and scores only start when a view needs them, finished ones are kept.
   */
  addFlights(flights: Flight[]) {
    const ids = this.flights.map((f) => f.source.id);
    const fresh: Flight[] = [];
    for (const f of flights) {
      if (ids.includes(f.id)) continue;
      ids.push(f.id);
      fresh.push(f);
    }

    if (!fresh.length) return;
    const old = this.flights;
    const sources = [...old.map((f) => f.source), ...fresh];
    const offsets = this.offsets(sources);
    this.flights = sources.map((source, i) => {
      const prev = old[i];
      if (!prev) return this.load(source, offsets[i], i);
      if (prev.timeOffset === offsets[i]) return prev;
      return { ...prev, flight: { ...source, fixes: shiftFixes(source.fixes, offsets[i]) }, timeOffset: offsets[i] };
    });

    this.seek(this.time);
    this.restart('ground');
    this.restart('xc');
    // Camera tracks are stored per set of flights, so keep the current ones under the new set.
    if (this.cameraTracks !== DEFAULT_TRACKS) this.saveCameraTracks();
  }

  private load(source: Flight, timeOffset: number, index: number): LoadedFlight {
    const analysis = analyzeFlight(source);
    return {
      source,
      flight: { ...source, fixes: shiftFixes(source.fixes, timeOffset) },
      timeOffset,
      analysis,
      climbs: this.climbsOf(source, analysis),
      color: this.colorOverrides[source.id] ?? pilotColor(index),
      visible: true,
      altOffset: 0
    };
  }

  /** Number of views that currently need each kind of work. */
  private needs: Record<NeedKind, number> = { xc: 0, ground: 0 };
  /** Ground height loads in flight, scoring running. For spinners. */
  private groundLoads = $state(0);
  xcBusy = $state(false);
  groundBusy = $derived(this.groundLoads > 0);
  /** Bumped per set of flights, so late results of an old set are dropped. */
  private flightsGen = 0;
  private groundTask: Promise<void> = Promise.resolve();

  /**
   * Asks for heavy background work: 'xc' scores the flights, 'ground' loads ground heights (for AGL).
   * Nothing runs until the first need. Call the returned function when the view goes away.
   * Releasing the last need stops the work at its next step, finished results are kept.
   */
  need(kind: NeedKind): () => void {
    this.needs[kind]++;
    if (this.needs[kind] === 1) this.restart(kind);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--this.needs[kind] > 0 || kind !== 'xc') return;
      this.xcRun++;
      this.xcBusy = false;
    };
  }

  /** Resolves when the work of a kind has finished for the current flights. Call after need(). */
  whenReady(kind: NeedKind): Promise<void> {
    return kind === 'ground' ? this.groundTask : this.xcTask;
  }

  /** Starts the work of a kind when something needs it, resuming over flights that are already done. */
  private restart(kind: NeedKind) {
    if (this.needs[kind] === 0) return;
    if (kind === 'ground') this.groundTask = this.loadGround();
    else this.xcTask = this.scoreAll();
  }

  /** Loads the camera tracks saved for the loaded flights. Storage errors keep the defaults. */
  async loadCameraTracks() {
    const ids = this.flights.map((f) => f.flight.id);
    try {
      this.cameraTracks = await flightRepository.getCameraTracks(ids);
    } catch (err) {
      console.error('Could not load camera tracks', err);
    }
  }

  /**
   * The one way to edit camera tracks. Undoable, stored, and switches the camera to 'keys'.
   */
  editCamera(next: CameraTracks) {
    if (next === this.cameraTracks) return;
    this.undoStack = [...this.undoStack.slice(-(UNDO_LIMIT - 1)), this.cameraTracks];
    this.redoStack = [];
    this.cameraTracks = next;
    this.camera = 'keys';
    this.saveCameraTracks();
  }

  undoCamera() {
    const prev = this.undoStack.at(-1);
    if (!prev) return;
    this.undoStack = this.undoStack.slice(0, -1);
    this.redoStack = [...this.redoStack, this.cameraTracks];
    this.cameraTracks = prev;
    this.saveCameraTracks();
  }

  redoCamera() {
    const next = this.redoStack.at(-1);
    if (!next) return;
    this.redoStack = this.redoStack.slice(0, -1);
    this.undoStack = [...this.undoStack, this.cameraTracks];
    this.cameraTracks = next;
    this.saveCameraTracks();
  }

  /** Debounced so dragging a number field does not write on every keystroke. */
  private saveCameraTracks() {
    clearTimeout(this.cameraSaveTimer);
    // Bind ids and tracks now: the flights may change before the timer fires.
    const ids = this.flights.map((f) => f.flight.id);
    const tracks = this.cameraTracks;
    this.pendingCameraSave = () =>
      flightRepository.saveCameraTracks(ids, tracks).catch((err) => console.error('Could not save camera tracks', err));
    this.cameraSaveTimer = setTimeout(() => this.persistCameraTracks(), CAMERA_SAVE_DELAY);
  }

  /** Writes a pending debounced save right away. */
  private persistCameraTracks() {
    clearTimeout(this.cameraSaveTimer);
    this.cameraSaveTimer = undefined;
    this.pendingCameraSave?.();
    this.pendingCameraSave = undefined;
  }

  /** Fetches ground heights of the flights that have none. Failures leave ground undefined. */
  private async loadGround() {
    const gen = this.flightsGen;
    const todo = this.flights.filter((f) => !f.ground);
    this.groundLoads++;
    try {
      await Promise.all(
        todo.map(async (f) => {
          try {
            const ground = await groundSeries(f.source.fixes);
            // Finished results are kept even when the need went away meanwhile.
            if (gen !== this.flightsGen) return;
            this.flights = this.flights.map((g) => (g.flight.id === f.flight.id ? { ...g, ground } : g));
          } catch {
            // Offline or tile error: AGL stays unavailable for this flight.
          }
        })
      );
    } finally {
      this.groundLoads--;
    }
  }

  private xcRun = 0;
  private xcTask: Promise<void> = Promise.resolve();

  /** Switches the scoring league. Scores of the old league are dropped, scoring restarts only if needed. */
  setLeague(league: typeof xcPrefs.league) {
    xcPrefs.set(league);
    this.xcRun++;
    this.flights = this.flights.map((f) => ({ ...f, xc: undefined }));
    this.restart('xc');
  }

  /**
   * Scores the flights without a score, one at a time, cached results first.
   * A newer run or the last release supersedes this one at the next flight.
   */
  private async scoreAll() {
    const run = ++this.xcRun;
    const league = xcPrefs.league;
    this.xcBusy = true;
    try {
      for (const { source, xc: done } of this.flights) {
        if (done !== undefined) continue;
        let xc: XcScore | null | undefined;
        try {
          xc = await flightRepository.getXcScore(source.id, league);
          if (xc === undefined) {
            xc = await scoreFlight(source.fixes, league);
            await flightRepository.putXcScore(source.id, league, xc);
          }
        } catch (err) {
          console.error('Could not score flight', err);
          xc ??= null;
        }

        if (run !== this.xcRun) return;
        this.flights = this.flights.map((f) => (f.source.id === source.id ? { ...f, xc } : f));
        await yieldToMain();
        if (run !== this.xcRun) return;
      }
    } finally {
      if (run === this.xcRun) this.xcBusy = false;
    }
  }

  /** Height above ground of fix i in metres, or undefined until ground heights have loaded. */
  aglAt(f: LoadedFlight, i: number): number | undefined {
    return f.ground ? f.flight.fixes[i].alt + f.altOffset - f.ground[i] : undefined;
  }

  /** Transition summary in MSL, or in AGL (altitudes null until ground heights have loaded). */
  transitionSummary(f: LoadedFlight, agl: boolean): TransitionSummary {
    return agl ? summarizeTransitions(f.climbs.transitions, (i) => this.aglAt(f, i)) : f.climbs.summary;
  }

  private climbsOf(source: Flight, analysis: FlightAnalysis): Climbs {
    const thermals = filterThermals(analysis.thermals, this.thermalFilter);
    const transitions = extractTransitions(source.fixes, thermals);
    return {
      thermals,
      transitions,
      summary: summarizeTransitions(transitions),
      kinds: climbKinds(source.fixes.length, thermals, transitions)
    };
  }

  /** Sets the thermal thresholds (SI units) and recomputes the climbs of every flight. */
  setThermalFilter(filter: ThermalFilter) {
    // Round so display-unit sliders do not leave float noise in the URL.
    this.thermalFilter = {
      minGain: Math.max(0, Math.round(filter.minGain * 10) / 10),
      minClimb: Math.max(0, Math.round(filter.minClimb * 100) / 100)
    };
    this.flights = this.flights.map((f) => ({ ...f, climbs: this.climbsOf(f.source, f.analysis) }));
  }

  private offsets(flights: Flight[]): number[] {
    const base = syncOffsets(
      flights.map((f) => f.fixes),
      this.syncMode
    );
    return flights.map((f, i) => base[i] + (this.nudges[f.id] ?? 0));
  }

  /** Re-applies sync mode and nudges, keeping the studio position within the new range. */
  private reshift() {
    const offsets = this.offsets(this.flights.map((f) => f.source));
    this.flights = this.flights.map((f, i) =>
      f.timeOffset === offsets[i]
        ? f
        : { ...f, flight: { ...f.source, fixes: shiftFixes(f.source.fixes, offsets[i]) }, timeOffset: offsets[i] }
    );
    this.seek(this.time);
  }

  /** Switches alignment and drops manual nudges. */
  setSyncMode(mode: SyncMode) {
    this.syncMode = mode;
    this.nudges = {};
    this.reshift();
  }

  /** Sets the manual time shift of one flight, ms (0 removes it). */
  setNudge(id: string, ms: number) {
    const { [id]: _, ...rest } = this.nudges;
    this.nudges = ms === 0 ? rest : { ...rest, [id]: ms };
    this.reshift();
  }

  /** Real (recorded) clock time of a flight at the current playback time. */
  localTime(f: LoadedFlight): number {
    return this.time - f.timeOffset;
  }

  /** Overrides a pilot's colour everywhere, null restores the palette colour. */
  setPilotColor(id: string, hex: string | null) {
    const { [id]: _, ...rest } = this.colorOverrides;
    this.colorOverrides = hex ? { ...rest, [id]: hex } : rest;
    this.flights = this.flights.map((f, i) => (f.flight.id === id ? { ...f, color: hex ?? pilotColor(i) } : f));
  }

  setVisible(id: string, visible: boolean) {
    this.flights = this.flights.map((f) => (f.flight.id === id ? { ...f, visible } : f));
  }

  /** Sets the vertical 3D correction per flight (terrain alignment). */
  setAltOffsets(offsets: Map<string, number>) {
    this.flights = this.flights.map((f) => ({ ...f, altOffset: offsets.get(f.flight.id) ?? f.altOffset }));
  }

  seek(t: number) {
    this.time = Math.min(this.end, Math.max(this.start, t));
  }

  play() {
    if (this.time >= this.end) this.time = this.start;
    this.playing = true;
    this.lastTick = performance.now();
    const tick = (now: number) => {
      if (!this.playing) return;
      this.seek(this.time + (now - this.lastTick) * this.speed);
      this.lastTick = now;
      if (this.time >= this.end) this.playing = false;
      else this.frame = requestAnimationFrame(tick);
    };

    this.frame = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.frame);
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Jumps to the selected pilot's next thermal after the current time. */
  nextThermal() {
    const sel = this.selected;
    if (!sel) return;
    const { fixes } = sel.flight;
    const i = indexAt(fixes, this.time);
    const next = sel.climbs.thermals.find((t) => t.start > i + 1);
    if (next) this.seek(fixes[next.start].t);
  }

  destroy() {
    this.pause();
    // Do not lose an edit made just before leaving the page.
    this.persistCameraTracks();
  }
}
