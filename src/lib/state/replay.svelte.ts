import type { BeginCapture } from '#lib/cesium/capture';
import { MAX_KEYS, clampKey, parseKeys, unwrapNear, type Keyframe } from '#lib/domain/cameraPath';
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
import { flightRepository } from '#lib/storage';
import { pilotColor } from '#lib/ui/colors';

/** Camera key edits wait this long after the last change before they are stored, ms. */
const KEY_SAVE_DELAY = 300;

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
  /** Flight on the replay clock: source fixes shifted by timeOffset. */
  flight: Flight;
  /** Shift from real time to replay time, ms (sync mode + manual nudge). */
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
}

export const SPEEDS = [1, 5, 10, 25, 50, 100, 200] as const;

export interface SceneInit {
  syncMode?: SyncMode | null;
  nudges?: Record<string, number>;
  thermalFilter?: ThermalFilter;
  colors?: Record<string, string>;
}

/**
 * Replay state shared by all views. The replay clock lives here (not in Cesium) so the
 * 2D-only layout keeps playing without a 3D viewer mounted.
 */
export class ReplayState {
  // Raw (not deeply reactive): tracks hold tens of thousands of fixes. Replace the array to update.
  flights = $state.raw<LoadedFlight[]>([]);
  /** Unix ms on the replay clock. */
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
  exaggeration = $state(DEFAULT_SCENE.exaggeration);
  lighting = $state(DEFAULT_SCENE.lighting);
  labels = $state(DEFAULT_SCENE.labels);
  /** Pilot colours picked by the user, per flight id. */
  colorOverrides = $state.raw<Record<string, string>>({});
  /** Renders the 3D frame at a size. Null until the 3D viewer is ready. */
  capture = $state.raw<((w: number, h: number) => Promise<HTMLCanvasElement>) | null>(null);
  /** Starts a frame-by-frame capture session for video export. Null until the 3D viewer is ready. */
  beginCapture = $state.raw<BeginCapture | null>(null);
  /** Video export range marks, Unix ms. Null means replay start or end. */
  exportIn = $state<number | null>(null);
  exportOut = $state<number | null>(null);
  /** Camera keys for 'keys' mode, sorted by time. Stored per set of flights on this device. */
  keyframes = $state.raw<Keyframe[]>([]);
  /** Camera view of the selected pilot now, as a key at replay time. Null until the 3D viewer is ready. */
  captureCameraKey = $state.raw<(() => Keyframe | null) | null>(null);

  start = $derived(this.flights.length ? Math.min(...this.flights.map((f) => f.flight.fixes[0].t)) : 0);
  end = $derived(this.flights.length ? Math.max(...this.flights.map((f) => f.flight.fixes.at(-1)!.t)) : 0);
  selected = $derived(this.flights.find((f) => f.flight.id === this.selectedId) ?? this.flights[0]);
  /** True when flights start on different days, i.e. alignment matters. */
  multiDay = $derived(defaultSyncMode(this.flights.map((f) => f.source.fixes)) === 'timeOfDay');

  private frame = 0;
  private lastTick = 0;
  private keySaveTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingKeySave: (() => void) | undefined;

  setFlights(flights: Flight[], init: SceneInit = {}) {
    // Keys belong to the previous set of flights: save them, then start empty until loadKeyframes.
    this.persistKeyframes();
    this.keyframes = [];
    this.syncMode = init.syncMode ?? defaultSyncMode(flights.map((f) => f.fixes));
    this.nudges = init.nudges ?? {};
    this.thermalFilter = init.thermalFilter ?? DEFAULT_FILTER;
    this.colorOverrides = init.colors ?? {};
    const offsets = this.offsets(flights);
    this.flights = flights.map((source, i) => {
      const analysis = analyzeFlight(source);
      return {
        source,
        flight: { ...source, fixes: shiftFixes(source.fixes, offsets[i]) },
        timeOffset: offsets[i],
        analysis,
        climbs: this.climbsOf(source, analysis),
        color: this.colorOverrides[source.id] ?? pilotColor(i),
        visible: true,
        altOffset: 0
      };
    });
    this.selectedId = flights[0]?.id ?? null;
    this.time = this.start;
    void this.loadGround();
  }

  /** Loads the camera keys saved for the loaded flights. Storage errors leave the keys empty. */
  async loadKeyframes() {
    const ids = this.flights.map((f) => f.flight.id);
    try {
      this.keyframes = parseKeys(await flightRepository.getCameraPath(ids));
    } catch (err) {
      console.error('Could not load camera keys', err);
    }
  }

  /** Replaces all camera keys (validated, sorted and capped) and stores them. */
  setKeyframes(keys: Keyframe[]) {
    this.keyframes = parseKeys(keys);
    this.saveKeyframes();
  }

  /** Adds a key in time order. False when the list is full or the key is invalid. */
  addKeyframe(key: Keyframe): boolean {
    const before = this.keyframes.length;
    if (before < MAX_KEYS) this.setKeyframes([...this.keyframes, key]);
    return this.keyframes.length > before;
  }

  /** Changes one key. The heading is read as the nearest angle to the old one, so it stays on the short way. */
  updateKeyframe(index: number, patch: Partial<Keyframe>) {
    const old = this.keyframes[index];
    if (!old) return;
    const heading = patch.heading === undefined ? old.heading : unwrapNear(patch.heading, old.heading);
    const next = clampKey({ ...old, ...patch, heading });
    if (next) this.setKeyframes(this.keyframes.map((k, i) => (i === index ? next : k)));
  }

  removeKeyframe(index: number) {
    this.setKeyframes(this.keyframes.filter((_, i) => i !== index));
  }

  /** Debounced so dragging a number field does not write on every keystroke. */
  private saveKeyframes() {
    clearTimeout(this.keySaveTimer);
    // Bind ids and keys now: the flights may change before the timer fires.
    const ids = this.flights.map((f) => f.flight.id);
    const keys = this.keyframes;
    this.pendingKeySave = () =>
      flightRepository.saveCameraPath(ids, keys).catch((err) => console.error('Could not save camera keys', err));
    this.keySaveTimer = setTimeout(() => this.persistKeyframes(), KEY_SAVE_DELAY);
  }

  /** Writes a pending debounced save right away. */
  private persistKeyframes() {
    clearTimeout(this.keySaveTimer);
    this.keySaveTimer = undefined;
    this.pendingKeySave?.();
    this.pendingKeySave = undefined;
  }

  /** Fetches ground heights per flight in the background. Failures leave ground undefined. */
  private async loadGround() {
    const ground = new Map<string, Float32Array>();
    await Promise.all(
      this.flights.map(async (f) => {
        try {
          ground.set(f.flight.id, await groundSeries(f.source.fixes));
        } catch {
          // Offline or tile error: AGL stays unavailable for this flight.
        }
      })
    );
    this.flights = this.flights.map((f) => (ground.has(f.flight.id) ? { ...f, ground: ground.get(f.flight.id) } : f));
  }

  /** Height above ground of fix i in metres, or undefined until ground heights have loaded. */
  aglAt(f: LoadedFlight, i: number): number | undefined {
    return f.ground ? f.flight.fixes[i].alt + f.altOffset - f.ground[i] : undefined;
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

  /** Re-applies sync mode and nudges, keeping the replay position within the new range. */
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

  /** Real (recorded) clock time of a flight at the current replay time. */
  localTime(f: LoadedFlight): number {
    return this.time - f.timeOffset;
  }

  /** Overrides a pilot's colour everywhere; null restores the palette colour. */
  setPilotColor(id: string, hex: string | null) {
    const { [id]: _, ...rest } = this.colorOverrides;
    this.colorOverrides = hex ? { ...rest, [id]: hex } : rest;
    this.flights = this.flights.map((f, i) =>
      f.flight.id === id ? { ...f, color: hex ?? pilotColor(i) } : f
    );
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
    this.persistKeyframes();
  }
}
