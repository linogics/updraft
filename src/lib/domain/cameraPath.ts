/** One camera key: the view of the selected pilot at a replay time. */
export interface Keyframe {
  /** Replay time, Unix ms. */
  t: number;
  /** Degrees, world, 0 = north. Unwrapped: 0 to 720 means two full turns. */
  heading: number;
  /** Degrees, negative looks down. */
  pitch: number;
  /** Metres from the selected pilot. */
  range: number;
}

export interface CameraView {
  heading: number;
  pitch: number;
  range: number;
}

export const MAX_KEYS = 200;
const PITCH = { min: -89, max: 0 } as const;
const RANGE = { min: 40, max: 20_000 } as const;

export function sortKeys(keys: Keyframe[]): Keyframe[] {
  return [...keys].sort((a, b) => a.t - b.t);
}

function finite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Rejects non-finite numbers and clamps pitch and range to their limits. */
export function clampKey(k: { t: unknown; heading: unknown; pitch: unknown; range: unknown }): Keyframe | null {
  if (!finite(k.t) || !finite(k.heading) || !finite(k.pitch) || !finite(k.range)) return null;
  return {
    t: k.t,
    heading: k.heading,
    pitch: clamp(k.pitch, PITCH.min, PITCH.max),
    range: clamp(k.range, RANGE.min, RANGE.max)
  };
}

/** Validates keys read from storage: drops bad entries, sorts and caps. */
export function parseKeys(raw: unknown): Keyframe[] {
  if (!Array.isArray(raw)) return [];
  const keys: Keyframe[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const key = clampKey(item);
    if (key) keys.push(key);
  }
  return sortKeys(keys).slice(0, MAX_KEYS);
}

/** The angle equal to h modulo 360 that is nearest to ref. Keeps interpolation on the short way. */
export function unwrapNear(h: number, ref: number): number {
  return h + 360 * Math.round((ref - h) / 360);
}

const catmullRom = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 *
  (2 * p1 +
    (p2 - p0) * u +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
    (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);

/**
 * View at replay time t. Catmull-Rom through the keys on heading, pitch and log(range), so the
 * motion is smooth. Clamps before the first and after the last key. Keys must be sorted.
 */
export function cameraAt(keys: Keyframe[], t: number): CameraView | undefined {
  if (!keys.length) return undefined;
  const last = keys.length - 1;
  if (t <= keys[0].t) return view(keys[0]);
  if (t >= keys[last].t) return view(keys[last]);

  let i = 0;
  while (keys[i + 1].t < t) i++;
  const p1 = keys[i];
  const p2 = keys[i + 1];
  const p0 = keys[Math.max(0, i - 1)];
  const p3 = keys[Math.min(last, i + 2)];
  const span = p2.t - p1.t;
  const u = span > 0 ? (t - p1.t) / span : 0;

  return {
    heading: catmullRom(p0.heading, p1.heading, p2.heading, p3.heading, u),
    pitch: clamp(catmullRom(p0.pitch, p1.pitch, p2.pitch, p3.pitch, u), PITCH.min, PITCH.max),
    range: clamp(
      Math.exp(
        catmullRom(Math.log(p0.range), Math.log(p1.range), Math.log(p2.range), Math.log(p3.range), u)
      ),
      RANGE.min,
      RANGE.max
    )
  };
}

function view(k: Keyframe): CameraView {
  return { heading: k.heading, pitch: k.pitch, range: k.range };
}
