import { distance } from '../geo';
import type { Fix, PhaseKind, Thermal } from '../model';

/** launch: takeoff to first climb; glide: climb to climb; final: last climb to landing. */
export type TransitionKind = 'launch' | 'glide' | 'final';

/** The flight between two climbs. Indices are inclusive and shared with the neighbouring thermals. */
export interface Transition {
  kind: TransitionKind;
  start: number;
  end: number;
  /** Seconds. */
  duration: number;
  startAlt: number;
  endAlt: number;
  /** Metres lost, negative if the transition gained height. */
  altLoss: number;
  /** Metres, straight line start to end. */
  distance: number;
  /** Metres along the track. */
  trackDistance: number;
  /** Straight-line speed made good, m/s. */
  speed: number;
  /** Straight distance per metre lost, null if no height was lost. */
  glideRatio: number | null;
}

/** Transition altitudes: where climbs were left and the next one found. Glides only. */
export interface TransitionSummary {
  count: number;
  avgStartAlt: number | null;
  avgEndAlt: number | null;
  lowestArrival: number | null;
  avgGlideRatio: number | null;
  /** m/s. */
  avgSpeed: number | null;
}

function transition(fixes: Fix[], kind: TransitionKind, start: number, end: number): Transition {
  const a = fixes[start];
  const b = fixes[end];
  const duration = (b.t - a.t) / 1000;
  const straight = distance(a, b);
  let trackDistance = 0;
  for (let i = start + 1; i <= end; i++) trackDistance += distance(fixes[i - 1], fixes[i]);
  const altLoss = a.alt - b.alt;
  return {
    kind,
    start,
    end,
    duration,
    startAlt: a.alt,
    endAlt: b.alt,
    altLoss,
    distance: straight,
    trackDistance,
    speed: duration > 0 ? straight / duration : 0,
    glideRatio: altLoss > 0 ? straight / altLoss : null
  };
}

/** Segments between the given thermals (sorted by start), so filtered-out climbs count as glide. */
export function extractTransitions(fixes: Fix[], thermals: Thermal[]): Transition[] {
  const out: Transition[] = [];
  if (fixes.length < 2) return out;
  let from = 0;
  thermals.forEach((th, i) => {
    if (th.start > from) out.push(transition(fixes, i === 0 ? 'launch' : 'glide', from, th.start));
    from = Math.max(from, th.end);
  });
  const last = fixes.length - 1;
  if (last > from) out.push(transition(fixes, 'final', from, last));
  return out;
}

export function summarizeTransitions(transitions: Transition[]): TransitionSummary {
  const glides = transitions.filter((t) => t.kind === 'glide');
  if (!glides.length) {
    return { count: 0, avgStartAlt: null, avgEndAlt: null, lowestArrival: null, avgGlideRatio: null, avgSpeed: null };
  }
  const sum = (f: (t: Transition) => number) => glides.reduce((s, t) => s + f(t), 0);
  const dist = sum((t) => t.distance);
  const loss = sum((t) => t.altLoss);
  const time = sum((t) => t.duration);
  return {
    count: glides.length,
    avgStartAlt: sum((t) => t.startAlt) / glides.length,
    avgEndAlt: sum((t) => t.endAlt) / glides.length,
    lowestArrival: Math.min(...glides.map((t) => t.endAlt)),
    avgGlideRatio: loss > 0 ? dist / loss : null,
    avgSpeed: time > 0 ? dist / time : null
  };
}

const TRANSITION_PHASE: Record<TransitionKind, PhaseKind> = { launch: 'searching', glide: 'gliding', final: 'searching' };

/** Per-fix climb / transition phase for colouring. Shared boundary fixes belong to the thermal. */
export function climbKinds(n: number, thermals: Thermal[], transitions: Transition[]): PhaseKind[] {
  const kinds = new Array<PhaseKind>(n).fill('searching');
  for (const t of transitions) kinds.fill(TRANSITION_PHASE[t.kind], t.start, t.end + 1);
  for (const t of thermals) kinds.fill('thermalling', t.start, t.end + 1);
  return kinds;
}
