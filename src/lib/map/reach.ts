import { destination, type LatLon } from '../domain/geo';
import { type GlideParams, groundGlide, rayRange } from '../domain/glide';
import { groundSeries } from './groundHeights';

const RAYS = 72;
const STEP = 250;
const MAX_RANGE = 100_000;
// shortcut: zoom 10 tiles (~100 m per pixel at 47 N) keep a 100 km reach to ~60 tile fetches, use 13 if ridges are missed.
const REACH_ZOOM = 10;

/** Reach polygon around `start` (a ring of one point per ray) and the ground height at the start. Rejects when tiles cannot load. */
export async function computeReach(
  start: LatLon,
  altitude: number,
  p: GlideParams
): Promise<{ ground: number; polygon: LatLon[] }> {
  const rays = Array.from({ length: RAYS }, (_, i) => {
    const bearing = (i * 360) / RAYS;
    // Terrain is never below 0 m, so this bounds the range without knowing it.
    const g = groundGlide(bearing, p);
    const n = Math.floor(Math.min(MAX_RANGE, Math.max(0, altitude - p.margin) * g) / STEP);
    return { bearing, g, n };
  });
  const samples = rays.flatMap(({ bearing, n }) =>
    Array.from({ length: n }, (_, k) => destination(start, bearing, (k + 1) * STEP))
  );
  const ground = await groundSeries([start, ...samples], REACH_ZOOM);
  let at = 1;
  const polygon = rays.map(({ bearing, g, n }) => {
    const range = n ? rayRange(altitude, g, p.margin, STEP, ground.subarray(at, at + n)) : 0;
    at += n;
    return destination(start, bearing, range);
  });
  return { ground: ground[0], polygon };
}
