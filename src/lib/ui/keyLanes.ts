import {
  CAMERA_PROPS,
  toLane,
  valueAt,
  type CameraProp,
  type CameraTracks,
  type Interp,
  type Key,
  type KeyRef,
  type PropTrack
} from '../domain/cameraPath';
import { m } from '../paraglide/messages';

/** Height of one camera row, px. Matches the pilot rows. */
export const ROW_PX = 26;
/** Blank space above and below the curve inside a lane, px. */
const LANE_PAD = 3;
/** Distance in px within which a dragged key snaps. */
export const SNAP_PX = 8;
/** Horizontal sampling step of the value curve, px. */
const CURVE_STEP_PX = 3;

export const PROP_LABEL: Record<CameraProp, () => string> = {
  heading: () => m.prop_heading(),
  pitch: () => m.prop_pitch(),
  range: () => m.prop_range()
};

export const INTERP_INFO: Record<Interp, { label: () => string; title: () => string }> = {
  auto: { label: () => m.interp_auto(), title: () => m.interp_auto_title() },
  linear: { label: () => m.interp_linear(), title: () => m.interp_linear_title() },
  hold: { label: () => m.interp_hold(), title: () => m.interp_hold_title() },
  ease: { label: () => m.interp_ease(), title: () => m.interp_ease_title() }
};

/** Range of a lane in lane space (log for range). */
export interface Scale {
  lo: number;
  hi: number;
}

/** Fits the values with a margin. Flat values get a band, so a lane never divides by zero. */
export function laneScale(values: number[]): Scale {
  if (!values.length) return { lo: -1, hi: 1 };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.1, 0.5);
  return { lo: lo - pad, hi: hi + pad };
}

/** Pixel y of a lane value, 0 at the top. */
export function valueY(u: number, scale: Scale, height: number): number {
  const inner = height - 2 * LANE_PAD;
  return LANE_PAD + (1 - (u - scale.lo) / (scale.hi - scale.lo)) * inner;
}

/** Lane-space change for a vertical drag of dy px. Dragging up raises the value. */
export function laneDelta(dy: number, scale: Scale, height: number): number {
  return (-dy * (scale.hi - scale.lo)) / (height - 2 * LANE_PAD);
}

export function polyline(xs: number[], ys: number[]): string {
  return xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join('');
}

/** SVG path of a property over the time window [a, b] drawn across width px, plus its scale. */
export function laneCurve(
  prop: CameraProp,
  track: PropTrack,
  a: number,
  b: number,
  width: number
): { d: string; scale: Scale } {
  const n = Math.max(1, Math.ceil(width / CURVE_STEP_PX));
  const xs: number[] = [];
  const us: number[] = [];
  for (let i = 0; i <= n; i++) {
    xs.push((i / n) * width);
    us.push(toLane(prop, valueAt(track, a + ((b - a) * i) / n, prop)));
  }

  const inView = track.keys.filter((k) => k.t >= a && k.t <= b).map((k) => toLane(prop, k.v));
  const scale = laneScale([...us, ...inView]);
  return {
    d: polyline(
      xs,
      us.map((u) => valueY(u, scale, ROW_PX))
    ),
    scale
  };
}

export interface Snap {
  t: number;
  guide: number | null;
}

/** Nearest target within threshold ms, else t unchanged. */
export function snapTime(t: number, targets: number[], threshold: number): Snap {
  let best: Snap = { t, guide: null };
  let bestDist = threshold;
  for (const target of targets) {
    const dist = Math.abs(t - target);
    if (dist <= bestDist) {
      bestDist = dist;
      best = { t: target, guide: target };
    }
  }

  return best;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A key drawn at px position (x, y) inside its lane area. */
export interface LanePoint extends KeyRef {
  x: number;
  y: number;
}

export function keysInBox(points: LanePoint[], box: Box): KeyRef[] {
  const xa = Math.min(box.x0, box.x1);
  const xb = Math.max(box.x0, box.x1);
  const ya = Math.min(box.y0, box.y1);
  const yb = Math.max(box.y0, box.y1);
  return points.filter((p) => p.x >= xa && p.x <= xb && p.y >= ya && p.y <= yb).map(({ prop, t }) => ({ prop, t }));
}

/** Union of two selections without duplicates. */
export function mergeRefs(a: KeyRef[], b: KeyRef[]): KeyRef[] {
  const seen = new Map<string, KeyRef>();
  for (const r of [...a, ...b]) seen.set(`${r.prop}:${r.t}`, r);
  return [...seen.values()];
}

/** Sorted, unique times of all keys of all props. */
export function keyTimes(tracks: CameraTracks): number[] {
  const times = new Set<number>();
  for (const p of CAMERA_PROPS) for (const k of tracks[p].keys) times.add(k.t);
  return [...times].sort((a, b) => a - b);
}

/** Time of the nearest key before t, ignoring a key at t itself. */
export function prevKeyTime(keys: Key[], t: number): number | undefined {
  return keys.filter((k) => k.t < t - 1).at(-1)?.t;
}

/** Time of the nearest key after t, ignoring a key at t itself. */
export function nextKeyTime(keys: Key[], t: number): number | undefined {
  return keys.find((k) => k.t > t + 1)?.t;
}
