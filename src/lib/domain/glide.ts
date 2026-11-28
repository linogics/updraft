import type { Transition } from './analysis/transitions';

/** Glider and air mass. Speeds in m/s, wind direction in degrees the wind blows FROM. */
export interface GlideParams {
  /** Still-air glide ratio. */
  ld: number;
  /** Trim airspeed, m/s. */
  airspeed: number;
  windSpeed: number;
  windFrom: number;
  /** Metres kept above the ground. */
  margin: number;
}

const RAD = Math.PI / 180;

/** Speed made good over ground along a track, crabbing into the wind. 0 if the track cannot be held. */
export function groundSpeed(track: number, p: Pick<GlideParams, 'airspeed' | 'windSpeed' | 'windFrom'>): number {
  const rel = (p.windFrom + 180 - track) * RAD;
  const along = p.windSpeed * Math.cos(rel);
  const across = p.windSpeed * Math.sin(rel);
  if (Math.abs(across) >= p.airspeed) return 0;
  return Math.max(0, along + Math.sqrt(p.airspeed ** 2 - across ** 2));
}

/** Ground distance per metre of height lost on a track, 0 if there is no progress. */
export function groundGlide(track: number, p: GlideParams): number {
  return p.airspeed > 0 ? (p.ld * groundSpeed(track, p)) / p.airspeed : 0;
}

/** Height above the leg start needed to fly `dist` metres on a track, null if the track cannot be flown. */
export function heightNeeded(dist: number, track: number, p: GlideParams): number | null {
  const g = groundGlide(track, p);
  return g > 0 ? dist / g + p.margin : null;
}

/**
 * Range in metres along one ray. `ground[k]` is the terrain height MSL at distance (k + 1) * step.
 * Stops before the first sample where the glide path is below terrain + margin.
 */
export function rayRange(altitude: number, glide: number, margin: number, step: number, ground: ArrayLike<number>) {
  for (let k = 0; k < ground.length; k++) {
    if (altitude - ((k + 1) * step) / glide < ground[k] + margin) return k * step;
  }

  return ground.length * step;
}

/** Median of a non-empty list. */
function median(v: number[]): number {
  const s = v.toSorted((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
}

/** Median still-air glide ratio and speed (m/s) of the straight glides, null if there are none. */
export function glideProfile(transitions: Transition[]): { ld: number; speed: number; count: number } | null {
  const straight = transitions.filter(
    (t) => t.kind === 'glide' && t.glideRatio !== null && t.distance >= 1000 && t.distance / t.trackDistance > 0.9
  );
  if (!straight.length) return null;
  return {
    ld: median(straight.map((t) => t.glideRatio!)),
    speed: median(straight.map((t) => t.speed)),
    count: straight.length
  };
}

/** Whether a value is acceptable for an input field of the glide calculator. */
export function validGlideInput(key: keyof GlideParams | 'altitude', v: number): boolean {
  if (!Number.isFinite(v)) return false;
  return key === 'ld' ? v >= 1 : key === 'airspeed' ? v > 0 : key === 'windFrom' || v >= 0;
}
