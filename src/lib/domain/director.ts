import { DEFAULT_TRACKS, MAX_KEYS, unwrapNear, type CameraTracks, type CameraView, type PropTrack } from './cameraPath';

type Shot = CameraView & { t: number };
import { bearing, distance } from './geo';
import type { Fix, Phase } from './model';
import { positionAt } from './timeline';

const ESTABLISH = { lookAhead: 60_000, pitch: -35, range: 2500 };
const CHASE = { step: 20_000, lookAhead: 20_000, pitch: -15, range: 350 };
const ORBIT = { step: 10_000, turn: 90, pitch: -25, range: 450 };
const PULL_BACK = { pitch: -45, range: 4000 };
/** Seconds one full orbit takes, so a single key pair gives a steady circle. */
const ORBIT_SECONDS_PER_TURN = 40;
/** Phases shorter than this get no keys of their own. */
const MIN_PHASE_MS = 60_000;
/** Mid density adds keys at this step inside phases longer than LONG_PHASE_MS. */
const MID_STEP_MS = 90_000;
const LONG_PHASE_MS = 180_000;
/** One phase ends a fix before the next starts. Closer keys would snap the camera between them. */
const MIN_KEY_GAP_MS = 10_000;

export type Density = 'low' | 'mid' | 'high';
export const DENSITIES: Density[] = ['low', 'mid', 'high'];
/** Below this movement the track has no usable direction. */
const MIN_MOVE_M = 1;

/** Bearing of the track from time t over span ms, or undefined when the pilot does not move. */
function trackBearing(fixes: Fix[], t: number, span: number): number | undefined {
  const from = positionAt(fixes, t);
  const to = positionAt(fixes, Math.min(t + span, fixes.at(-1)!.t));
  return distance(from, to) < MIN_MOVE_M ? undefined : bearing(from, to);
}

/** Times from a, every step ms, that lie strictly inside the range and before b. */
function ticks(a: number, b: number, step: number, inMs: number, outMs: number): number[] {
  const out: number[] = [];
  for (let t = a; t < b; t += step) if (t > inMs && t < outMs) out.push(t);
  return out;
}

/** Animated tracks of the shots, every key with auto interp. No shots gives the defaults. */
function toTracks(shots: Shot[]): CameraTracks {
  if (!shots.length) return DEFAULT_TRACKS;
  const track = (prop: 'heading' | 'pitch' | 'range'): PropTrack => ({
    animated: true,
    value: shots[0][prop],
    keys: shots.map((s) => ({ t: s.t, v: s[prop], interp: 'auto' }))
  });
  return { heading: track('heading'), pitch: track('pitch'), range: track('range') };
}

/**
 * Camera shot list for one pilot over the playback range: a wide establishing shot, chase keys on
 * glides, orbit keys in thermals and a final pull-back. Headings are unwrapped to the previous key.
 */
export function directCamera(
  flight: { fixes: Fix[] },
  phases: Phase[],
  range: { inMs: number; outMs: number },
  density: Density = 'low'
): CameraTracks {
  return toTracks(directShots(flight, phases, range, density));
}

function directShots(
  flight: { fixes: Fix[] },
  phases: Phase[],
  range: { inMs: number; outMs: number },
  density: Density
): Shot[] {
  const { fixes } = flight;
  const { inMs, outMs } = range;
  if (!fixes.length || outMs <= inMs) return [];

  let heading = trackBearing(fixes, inMs, ESTABLISH.lookAhead) ?? 0;
  const keys: Shot[] = [{ t: inMs, heading, pitch: ESTABLISH.pitch, range: ESTABLISH.range }];

  const sorted = [...phases].sort((a, b) => a.start - b.start);
  if (density !== 'high') {
    // Short phases are merged into the previous one, which then runs to their end.
    const segs: { kind: Phase['kind']; a: number; b: number }[] = [];
    for (const phase of sorted) {
      const a = fixes[phase.start].t;
      const b = fixes[phase.end].t;
      if (b - a < MIN_PHASE_MS && segs.length) segs.at(-1)!.b = b;
      else segs.push({ kind: phase.kind, a, b });
    }

    for (const { kind, a, b } of segs) {
      const times = [a];
      if (density === 'mid' && b - a > LONG_PHASE_MS) {
        for (let t = a + MID_STEP_MS; t < b; t += MID_STEP_MS) times.push(t);
      }

      times.push(b);
      const start = heading;
      const turns = Math.max(1, Math.round((b - a) / 1000 / ORBIT_SECONDS_PER_TURN));
      for (const t of times) {
        if (kind === 'thermalling') {
          heading = start + (t === b ? turns * 360 : (360 * (t - a)) / 1000 / ORBIT_SECONDS_PER_TURN);
        } else if (t > inMs && t < outMs) {
          const next = trackBearing(fixes, t, CHASE.lookAhead);
          if (next !== undefined) heading = unwrapNear(next, heading);
        }

        if (t <= inMs || t >= outMs || t - keys.at(-1)!.t < MIN_KEY_GAP_MS) continue;
        const shot = kind === 'thermalling' ? ORBIT : CHASE;
        keys.push({ t, heading, pitch: shot.pitch, range: shot.range });
      }
    }
  }

  if (density === 'high') {
    for (const phase of sorted) {
      const a = fixes[phase.start].t;
      const b = fixes[phase.end].t;
      if (phase.kind === 'thermalling') {
        // Orbit: a fixed turn per key, so the camera circles the pilot whatever the track does.
        for (const t of ticks(a, b, ORBIT.step, inMs, outMs)) {
          heading += ORBIT.turn;
          keys.push({ t, heading, pitch: ORBIT.pitch, range: ORBIT.range });
        }
      } else {
        for (const t of ticks(a, b, CHASE.step, inMs, outMs)) {
          const next = trackBearing(fixes, t, CHASE.lookAhead);
          if (next !== undefined) heading = unwrapNear(next, heading);
          keys.push({ t, heading, pitch: CHASE.pitch, range: CHASE.range });
        }
      }
    }
  }

  keys.push({ t: outMs, heading, pitch: PULL_BACK.pitch, range: PULL_BACK.range });
  if (keys.length <= MAX_KEYS) return keys;
  // Thin evenly, keeping the first and last shot.
  return Array.from({ length: MAX_KEYS }, (_, i) => keys[Math.round((i * (keys.length - 1)) / (MAX_KEYS - 1))]);
}
