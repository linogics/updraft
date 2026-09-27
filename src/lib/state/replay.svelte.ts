import { analyzeFlight } from '#lib/domain/analysis/analyze';
import type { Flight, FlightAnalysis } from '#lib/domain/model';
import { DEFAULT_SCENE, type BasemapId, type CameraMode, type ColorMode, type Layout, type TerrainSource } from '#lib/domain/scene';
import { defaultSyncMode, shiftFixes, syncOffsets, type SyncMode } from '#lib/domain/sync';
import { indexAt } from '#lib/domain/timeline';
import { pilotColor } from '#lib/ui/colors';

export interface LoadedFlight {
  /** Flight as stored, real timestamps. */
  source: Flight;
  /** Flight on the replay clock: source fixes shifted by timeOffset. */
  flight: Flight;
  /** Shift from real time to replay time, ms (sync mode + manual nudge). */
  timeOffset: number;
  /** Indices and durations only, so it is valid for source and shifted flight alike. */
  analysis: FlightAnalysis;
  color: string;
  visible: boolean;
  /** Vertical correction applied in 3D, metres (terrain alignment + manual). */
  altOffset: number;
}

export const SPEEDS = [1, 5, 10, 25, 50, 100, 200] as const;

export interface SceneInit {
  syncMode?: SyncMode | null;
  nudges?: Record<string, number>;
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

  start = $derived(this.flights.length ? Math.min(...this.flights.map((f) => f.flight.fixes[0].t)) : 0);
  end = $derived(this.flights.length ? Math.max(...this.flights.map((f) => f.flight.fixes.at(-1)!.t)) : 0);
  selected = $derived(this.flights.find((f) => f.flight.id === this.selectedId) ?? this.flights[0]);
  /** True when flights start on different days, i.e. alignment matters. */
  multiDay = $derived(defaultSyncMode(this.flights.map((f) => f.source.fixes)) === 'timeOfDay');

  private frame = 0;
  private lastTick = 0;

  setFlights(flights: Flight[], init: SceneInit = {}) {
    this.syncMode = init.syncMode ?? defaultSyncMode(flights.map((f) => f.fixes));
    this.nudges = init.nudges ?? {};
    const offsets = this.offsets(flights);
    this.flights = flights.map((source, i) => ({
      source,
      flight: { ...source, fixes: shiftFixes(source.fixes, offsets[i]) },
      timeOffset: offsets[i],
      analysis: analyzeFlight(source),
      color: pilotColor(i),
      visible: true,
      altOffset: 0
    }));
    this.selectedId = flights[0]?.id ?? null;
    this.time = this.start;
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
    const next = sel.analysis.thermals.find((t) => t.start > i + 1);
    if (next) this.seek(fixes[next.start].t);
  }

  destroy() {
    this.pause();
  }
}
