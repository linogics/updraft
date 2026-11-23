/** Camera property with its own track. */
export type CameraProp = 'heading' | 'pitch' | 'range';
export const CAMERA_PROPS: readonly CameraProp[] = ['heading', 'pitch', 'range'];

/** Shape of the segment leaving a key. */
export type Interp = 'auto' | 'linear' | 'hold' | 'ease';
export const INTERPS: readonly Interp[] = ['auto', 'linear', 'hold', 'ease'];
const isInterp = (v: unknown): v is Interp => INTERPS.includes(v as Interp);

/** A value at a replay time. interp shapes the segment that leaves this key. */
export interface Key {
  /** Replay time, Unix ms. */
  t: number;
  /** Degrees for heading and pitch, metres for range. */
  v: number;
  interp: Interp;
}

/** Keys of one property. The value is constant while the track is not animated. */
export interface PropTrack {
  animated: boolean;
  value: number;
  /** Sorted by t. */
  keys: Key[];
}

export interface CameraTracks {
  heading: PropTrack;
  pitch: PropTrack;
  range: PropTrack;
}

export interface CameraView {
  heading: number;
  pitch: number;
  range: number;
}

/** One key on the timeline, by property and time. */
export interface KeyRef {
  prop: CameraProp;
  t: number;
}

/** Times per property. */
export type TimeSets = Record<CameraProp, ReadonlySet<number>>;

/** Copied keys with times relative to the first copied key. */
export type KeyClip = Partial<Record<CameraProp, Key[]>>;

export const MAX_KEYS = 200;
/** Keys closer than this many ms are the same key. */
const SAME_MS = 1;
const LIMITS: Record<CameraProp, { min: number; max: number }> = {
  heading: { min: -Infinity, max: Infinity },
  pitch: { min: -89, max: 0 },
  range: { min: 40, max: 20_000 }
};
const DEFAULTS: Record<CameraProp, number> = { heading: 0, pitch: -18, range: 350 };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

export function clampProp(prop: CameraProp, v: number): number {
  const { min, max } = LIMITS[prop];
  return Math.min(max, Math.max(min, v));
}

/** Range is interpolated in log space, so steps look even. Other props are linear. */
export const toLane = (prop: CameraProp, v: number) => (prop === 'range' ? Math.log(v) : v);
export const fromLane = (prop: CameraProp, u: number) => (prop === 'range' ? Math.exp(u) : u);

/** The angle equal to h modulo 360 that is nearest to ref. Keeps interpolation on the short way. */
export function unwrapNear(h: number, ref: number): number {
  return h + 360 * Math.round((ref - h) / 360);
}

function fixed(prop: CameraProp): PropTrack {
  return { animated: false, value: DEFAULTS[prop], keys: [] };
}

export const DEFAULT_TRACKS: CameraTracks = {
  heading: fixed('heading'),
  pitch: fixed('pitch'),
  range: fixed('range')
};

const sortKeys = (keys: Key[]): Key[] => keys.sort((a, b) => a.t - b.t);

/** Key at t (within SAME_MS), if any. */
export function keyAt(track: PropTrack, t: number): Key | undefined {
  return track.keys.find((k) => Math.abs(k.t - t) < SAME_MS);
}

/** Index of the last key at or before t. Needs keys.length >= 2 and t inside their span. */
function segmentAt(keys: Key[], t: number): number {
  let lo = 0;
  let hi = keys.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

const catmullRom = (p0: number, p1: number, p2: number, p3: number, u: number) =>
  0.5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);

/**
 * Value of one property at replay time t. Clamps before the first and after the last key.
 * The interp of the key before t shapes the segment. Output is clamped to the prop limits.
 */
export function valueAt(track: PropTrack, t: number, prop: CameraProp): number {
  const { keys } = track;
  if (!track.animated || !keys.length) return clampProp(prop, track.value);
  const last = keys.length - 1;
  if (t <= keys[0].t) return clampProp(prop, keys[0].v);
  if (t >= keys[last].t) return clampProp(prop, keys[last].v);

  const i = segmentAt(keys, t);
  const p1 = keys[i];
  const p2 = keys[i + 1];
  const span = p2.t - p1.t;
  const u = span > 0 ? (t - p1.t) / span : 0;
  const a = toLane(prop, p1.v);
  const b = toLane(prop, p2.v);
  let lane: number;
  if (p1.interp === 'hold') lane = a;
  else if (p1.interp === 'linear') lane = a + (b - a) * u;
  else if (p1.interp === 'ease') lane = a + (b - a) * u * u * (3 - 2 * u);
  else {
    const p0 = toLane(prop, keys[Math.max(0, i - 1)].v);
    const p3 = toLane(prop, keys[Math.min(last, i + 2)].v);
    lane = catmullRom(p0, a, b, p3, u);
  }
  return clampProp(prop, fromLane(prop, lane));
}

export function viewAt(tracks: CameraTracks, t: number): CameraView {
  return {
    heading: valueAt(tracks.heading, t, 'heading'),
    pitch: valueAt(tracks.pitch, t, 'pitch'),
    range: valueAt(tracks.range, t, 'range')
  };
}

/**
 * Writes a key at t, replacing the key within SAME_MS and keeping its interp.
 * Heading is unwrapped near the key before t. Refuses to exceed MAX_KEYS.
 */
function putKey(track: PropTrack, prop: CameraProp, t: number, v: number, interp?: Interp): PropTrack {
  if (!finite(t) || !finite(v)) return track;
  const same = keyAt(track, t);
  if (!same && track.keys.length >= MAX_KEYS) return track;
  const others = track.keys.filter((k) => k !== same);
  const before = others.filter((k) => k.t < t).at(-1) ?? others[0];
  const ref = before?.v ?? track.value;
  const value = prop === 'heading' ? unwrapNear(v, ref) : v;
  const key: Key = { t, v: clampProp(prop, value), interp: interp ?? same?.interp ?? 'auto' };
  return { ...track, keys: sortKeys([...others, key]) };
}

export function setKey(track: PropTrack, prop: CameraProp, t: number, v: number): PropTrack {
  return putKey(track, prop, t, v);
}

/** Sets the constant value of a track that is not animated. */
export function setValue(track: PropTrack, prop: CameraProp, v: number): PropTrack {
  return finite(v) ? { ...track, value: clampProp(prop, v) } : track;
}

/** Edit at the playhead: a key on an animated track, the constant otherwise. */
export function setValueAt(track: PropTrack, prop: CameraProp, t: number, v: number): PropTrack {
  return track.animated ? setKey(track, prop, t, v) : setValue(track, prop, v);
}

/**
 * Turns animation on or off. On starts with one key at t holding the value shown there.
 * Off removes all keys and keeps the value shown at t as the constant.
 */
export function setAnimated(track: PropTrack, on: boolean, t: number, valueAtPlayhead: number): PropTrack {
  if (!on) return { animated: false, value: valueAtPlayhead, keys: [] };
  if (track.animated) return track;
  return { animated: true, value: track.value, keys: [{ t, v: valueAtPlayhead, interp: 'auto' }] };
}

/** Removes the keys at the given times. An emptied track keeps the value its last key showed. */
export function removeKeys(track: PropTrack, times: ReadonlySet<number>): PropTrack {
  const keys = track.keys.filter((k) => !times.has(k.t));
  if (keys.length === track.keys.length) return track;
  const value = keys.length ? track.value : track.keys.at(-1)!.v;
  return { ...track, value, keys };
}

/** Shifts the keys at the given times by dt ms. A key that lands on an unmoved key replaces it. */
export function moveKeys(track: PropTrack, times: ReadonlySet<number>, dt: number): PropTrack {
  if (!dt) return track;
  const moved = track.keys.filter((k) => times.has(k.t)).map((k) => ({ ...k, t: k.t + dt }));
  const landed = new Set(moved.map((k) => k.t));
  const rest = track.keys.filter((k) => !times.has(k.t) && !landed.has(k.t));
  return { ...track, keys: sortKeys([...rest, ...moved]) };
}

export function setKeysInterp(track: PropTrack, times: ReadonlySet<number>, interp: Interp): PropTrack {
  return { ...track, keys: track.keys.map((k) => (times.has(k.t) ? { ...k, interp } : k)) };
}

/** Moves the values of the keys at the given times by dv, in lane space (log for range). */
export function shiftValues(track: PropTrack, prop: CameraProp, times: ReadonlySet<number>, dv: number): PropTrack {
  if (!dv) return track;
  const keys = track.keys.map((k) =>
    times.has(k.t) ? { ...k, v: clampProp(prop, fromLane(prop, toLane(prop, k.v) + dv)) } : k
  );
  return { ...track, keys };
}

export function setTrack(tracks: CameraTracks, prop: CameraProp, track: PropTrack): CameraTracks {
  return { ...tracks, [prop]: track };
}

export function mapTracks(tracks: CameraTracks, fn: (track: PropTrack, prop: CameraProp) => PropTrack): CameraTracks {
  return {
    heading: fn(tracks.heading, 'heading'),
    pitch: fn(tracks.pitch, 'pitch'),
    range: fn(tracks.range, 'range')
  };
}

export function hasKeys(tracks: CameraTracks): boolean {
  return CAMERA_PROPS.some((p) => tracks[p].keys.length > 0);
}

/** Every track stops animating. Each keeps the value shown at t. */
export function clearKeys(tracks: CameraTracks, t: number): CameraTracks {
  return mapTracks(tracks, (track, prop) => setAnimated(track, false, t, valueAt(track, t, prop)));
}

export function timeSets(refs: KeyRef[]): TimeSets {
  const sets: Record<CameraProp, Set<number>> = { heading: new Set(), pitch: new Set(), range: new Set() };
  for (const r of refs) sets[r.prop].add(r.t);
  return sets;
}

/** Copies the picked keys. Null when none are picked. */
export function copyKeys(tracks: CameraTracks, picked: TimeSets): KeyClip | null {
  const times = CAMERA_PROPS.flatMap((p) => tracks[p].keys.filter((k) => picked[p].has(k.t)).map((k) => k.t));
  if (!times.length) return null;
  const t0 = Math.min(...times);
  const clip: KeyClip = {};
  for (const p of CAMERA_PROPS) {
    const keys = tracks[p].keys.filter((k) => picked[p].has(k.t)).map((k) => ({ ...k, t: k.t - t0 }));
    if (keys.length) clip[p] = keys;
  }
  return clip;
}

/** Pastes a clip at t, keeping the spacing. Tracks that are not animated are skipped. */
export function pasteKeys(tracks: CameraTracks, clip: KeyClip, t: number): CameraTracks {
  return mapTracks(tracks, (track, prop) => {
    const keys = clip[prop];
    if (!keys || !track.animated) return track;
    return keys.reduce((tr, k) => putKey(tr, prop, t + k.t, k.v, k.interp), track);
  });
}

/** Capture of a camera view at t: every prop is animated and gets a key there. */
export function captureView(tracks: CameraTracks, view: CameraView, t: number): CameraTracks {
  return mapTracks(tracks, (track, prop) => {
    const animated = track.animated ? track : setAnimated(track, true, t, valueAt(track, t, prop));
    return setKey(animated, prop, t, view[prop]);
  });
}

const isKeyObject = (item: unknown): item is Record<string, unknown> & { t: number; v: number } =>
  isObject(item) && finite(item.t) && finite(item.v);

function parseKeys(raw: unknown, prop: CameraProp): Key[] {
  if (!Array.isArray(raw)) return [];
  const keys: Key[] = [];
  for (const item of raw) {
    if (!isKeyObject(item)) continue;
    keys.push({ t: item.t, v: clampProp(prop, item.v), interp: isInterp(item.interp) ? item.interp : 'auto' });
  }
  return sortKeys(keys).slice(0, MAX_KEYS);
}

function parseTrack(raw: unknown, prop: CameraProp): PropTrack {
  if (!isObject(raw)) return fixed(prop);
  return {
    animated: raw.animated === true,
    value: finite(raw.value) ? clampProp(prop, raw.value) : DEFAULTS[prop],
    keys: parseKeys(raw.keys, prop)
  };
}

/**
 * Validates tracks read from storage. Anything that is not the CameraTracks shape
 * (including the old keyframe array) gives DEFAULT_TRACKS.
 */
export function parseTracks(raw: unknown): CameraTracks {
  if (!isObject(raw)) return DEFAULT_TRACKS;
  return {
    heading: parseTrack(raw.heading, 'heading'),
    pitch: parseTrack(raw.pitch, 'pitch'),
    range: parseTrack(raw.range, 'range')
  };
}
