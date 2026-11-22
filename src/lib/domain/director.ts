import { MAX_KEYS, unwrapNear, type Keyframe } from './cameraPath';
import { bearing, distance } from './geo';
import type { Fix, Phase } from './model';
import { positionAt } from './timeline';

const ESTABLISH = { lookAhead: 60_000, pitch: -35, range: 2500 };
const CHASE = { step: 20_000, lookAhead: 20_000, pitch: -15, range: 350 };
const ORBIT = { step: 10_000, turn: 90, pitch: -25, range: 450 };
const PULL_BACK = { pitch: -45, range: 4000 };
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

/**
 * Camera shot list for one pilot over the replay range: a wide establishing shot, chase keys on
 * glides, orbit keys in thermals and a final pull-back. Headings are unwrapped to the previous key.
 */
export function directCamera(flight: { fixes: Fix[] }, phases: Phase[], range: { inMs: number; outMs: number }): Keyframe[] {
  const { fixes } = flight;
  const { inMs, outMs } = range;
  if (!fixes.length || outMs <= inMs) return [];

  let heading = trackBearing(fixes, inMs, ESTABLISH.lookAhead) ?? 0;
  const keys: Keyframe[] = [{ t: inMs, heading, pitch: ESTABLISH.pitch, range: ESTABLISH.range }];

  for (const phase of [...phases].sort((a, b) => a.start - b.start)) {
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

  keys.push({ t: outMs, heading, pitch: PULL_BACK.pitch, range: PULL_BACK.range });
  if (keys.length <= MAX_KEYS) return keys;
  // Thin evenly, keeping the first and last shot.
  return Array.from({ length: MAX_KEYS }, (_, i) => keys[Math.round((i * (keys.length - 1)) / (MAX_KEYS - 1))]);
}
