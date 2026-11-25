import { distance } from './geo';
import type { Fix } from './model';

/** Segments with a longer time or distance gap are left straight, the track has a hole there. */
const MAX_GAP_MS = 60_000;
const MAX_GAP_M = 500;
/** Centripetal parametrisation, avoids loops and overshoot at sharp turns. */
const ALPHA = 0.5;
/** Knot step of about 1 mm of distance. Shorter steps blow the spline up, see smoothPath. */
const MIN_KNOT = 1e-4;

type Vec = [number, number, number];

const mix = (a: Vec, b: Vec, wa: number, wb: number): Vec => [
  a[0] * wa + b[0] * wb,
  a[1] * wa + b[1] * wb,
  a[2] * wa + b[2] * wb
];

/** Centripetal knots of the four control points. Planar lat/lon distance only, fine at these scales. */
function knots(p: [Vec, Vec, Vec, Vec]): [number, number, number, number] {
  const k: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 1; i < 4; i++) {
    k[i] = k[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) ** ALPHA;
  }

  return k;
}

/** Barry-Goldman evaluation of a centripetal Catmull-Rom segment p1..p2 at u in 0..1. */
function catmullRom(p: [Vec, Vec, Vec, Vec], k: [number, number, number, number], u: number): Vec {
  const t = k[1] + u * (k[2] - k[1]);
  const lerp = (a: Vec, b: Vec, ka: number, kb: number) => mix(a, b, (kb - t) / (kb - ka), (t - ka) / (kb - ka));
  const a1 = lerp(p[0], p[1], k[0], k[1]);
  const a2 = lerp(p[1], p[2], k[1], k[2]);
  const a3 = lerp(p[2], p[3], k[2], k[3]);
  return lerp(lerp(a1, a2, k[0], k[2]), lerp(a2, a3, k[1], k[3]), k[1], k[2]);
}

export interface SmoothPath {
  points: { lat: number; lon: number; alt: number }[];
  /** Per output point, the fix whose segment it belongs to (an interpolated point takes its segment's start fix). */
  source: number[];
  /** Per fix, the index of its own point in the output. */
  index: number[];
}

/**
 * Adds `perSegment` points between consecutive fixes along a centripetal Catmull-Rom spline
 * that passes through every fix. Only for drawing: playback keeps using the raw fixes.
 */
export function smoothPath(fixes: Fix[], perSegment = 3): SmoothPath {
  const points: SmoothPath['points'] = [];
  const source: number[] = [];
  const index: number[] = [];
  const vec = (i: number): Vec => [fixes[i].lat, fixes[i].lon, fixes[i].alt];
  // Beyond the ends, mirror the neighbouring fix so the spline has a control point there.
  const ctrl = (i: number, edge: number, inner: number): Vec => {
    if (i >= 0 && i < fixes.length) return vec(i);
    const [e, n] = [vec(edge), vec(inner)];
    return [2 * e[0] - n[0], 2 * e[1] - n[1], 2 * e[2] - n[2]];
  };

  for (let i = 0; i < fixes.length; i++) {
    index.push(points.length);
    points.push({ lat: fixes[i].lat, lon: fixes[i].lon, alt: fixes[i].alt });
    source.push(i);
    const next = fixes[i + 1];
    if (!next || fixes.length < 3) continue;
    if (next.t - fixes[i].t > MAX_GAP_MS || distance(fixes[i], next) > MAX_GAP_M) continue;
    const seg: [Vec, Vec, Vec, Vec] = [
      ctrl(i - 1, 0, 1),
      vec(i),
      vec(i + 1),
      ctrl(i + 2, fixes.length - 1, fixes.length - 2)
    ];
    const k = knots(seg);
    // A repeated position (pilot standing, alt still changing) gives a zero knot interval and the spline divides by it.
    const linear = k[1] - k[0] < MIN_KNOT || k[2] - k[1] < MIN_KNOT || k[3] - k[2] < MIN_KNOT;
    for (let j = 1; j <= perSegment; j++) {
      const u = j / (perSegment + 1);
      const [lat, lon, alt] = linear ? mix(seg[1], seg[2], 1 - u, u) : catmullRom(seg, k, u);
      points.push({ lat, lon, alt });
      source.push(i);
    }
  }

  return { points, source, index };
}
