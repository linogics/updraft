import { analyzeFlight } from '$lib/domain/analysis/analyze';
import type { Flight, FlightAnalysis } from '$lib/domain/model';
import { DEFAULT_SCENE, type CameraMode, type ColorMode, type Layout } from '$lib/domain/scene';
import { indexAt } from '$lib/domain/timeline';
import { pilotColor } from '$lib/ui/colors';

export interface LoadedFlight {
  flight: Flight;
  analysis: FlightAnalysis;
  color: string;
  visible: boolean;
  /** Vertical correction applied in 3D, metres (terrain alignment + manual). */
  altOffset: number;
}

export const SPEEDS = [1, 5, 10, 25, 50, 100, 200] as const;

/**
 * Replay state shared by all views. The replay clock lives here (not in Cesium) so the
 * 2D-only layout keeps playing without a 3D viewer mounted.
 */
export class ReplayState {
  flights = $state<LoadedFlight[]>([]);
  /** Unix ms. */
  time = $state(0);
  playing = $state(false);
  speed = $state<number>(25);
  selectedId = $state<string | null>(null);
  camera = $state<CameraMode>(DEFAULT_SCENE.camera);
  colorBy = $state<ColorMode>(DEFAULT_SCENE.colorBy);
  layout = $state<Layout>(DEFAULT_SCENE.layout);

  start = $derived(this.flights.length ? Math.min(...this.flights.map((f) => f.flight.fixes[0].t)) : 0);
  end = $derived(this.flights.length ? Math.max(...this.flights.map((f) => f.flight.fixes.at(-1)!.t)) : 0);
  selected = $derived(this.flights.find((f) => f.flight.id === this.selectedId) ?? this.flights[0]);

  private frame = 0;
  private lastTick = 0;

  setFlights(flights: Flight[]) {
    this.flights = flights.map((flight, i) => ({
      flight,
      analysis: analyzeFlight(flight),
      color: pilotColor(i),
      visible: true,
      altOffset: 0
    }));
    this.selectedId = flights[0]?.id ?? null;
    this.time = this.start;
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
