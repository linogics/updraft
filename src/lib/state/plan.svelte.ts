import { distance, type LatLon } from '#lib/domain/geo';
import { DEFAULT_SPEED } from '#lib/domain/route';
import type { XcScore } from '#lib/xc/types';

/** Route state of the planner, shared by the page and its panels. Points are replaced, never changed in place. */
export class PlanState {
  points = $state.raw<LatLon[]>([]);
  history = $state.raw<LatLon[][]>([]);
  selected = $state<number | null>(null);
  /** km/h */
  speed = $state(DEFAULT_SPEED);
  score = $state<XcScore | null>(null);
  scoring = $state(false);

  legs = $derived(this.points.slice(1).map((p, i) => distance(this.points[i], p)));
  total = $derived(this.legs.reduce((a, b) => a + b, 0));

  /** Replaces the route and remembers the old one for undo. */
  commit(next: LatLon[]) {
    this.history = [...this.history, this.points];
    this.points = next;
    this.selected = null;
  }

  undo() {
    this.points = this.history.at(-1) ?? this.points;
    this.history = this.history.slice(0, -1);
    this.selected = null;
  }
}
