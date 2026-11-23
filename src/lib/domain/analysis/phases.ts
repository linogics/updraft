import { headingDelta } from '../geo';
import type { Fix, Phase, PhaseKind } from '../model';

/** Half-width of the centred turn-accumulation window, seconds. */
const TURN_HALF_WINDOW = 15;
/** Net heading change inside the window that counts as circling, degrees. */
const CIRCLING_NET_TURN = 270;
/** Total heading change inside the window below which flight counts as straight, degrees. */
const STRAIGHT_MAX_TURN = 120;
/** Minimum own turn rate for a fix at the edge of a thermal to stay in it, deg/s. */
const THERMAL_EDGE_TURN_RATE = 4;
/** Phases shorter than this are merged into a neighbour, seconds. */
const MIN_PHASE_DURATION = 20;

/** Signed heading change ending at each fix, degrees. */
function turns(heading: number[]): number[] {
  return heading.map((h, i) => (i === 0 ? 0 : headingDelta(heading[i - 1], h)));
}

function classify(fixes: Fix[], turn: number[]): PhaseKind[] {
  const n = fixes.length;

  // Prefix sums make every window query O(1).
  const net = [0];
  const abs = [0];
  for (let i = 0; i < n; i++) {
    net.push(net[i] + turn[i]);
    abs.push(abs[i] + Math.abs(turn[i]));
  }

  const ms = TURN_HALF_WINDOW * 1000;
  const kinds = new Array<PhaseKind>(n);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (fixes[i].t - fixes[lo].t > ms) lo++;
    while (hi < n - 1 && fixes[hi + 1].t - fixes[i].t <= ms) hi++;
    // Turns are attributed to the fix they end at; skip lo's own turn (it starts outside).
    const netTurn = net[hi + 1] - net[lo + 1];
    const absTurn = abs[hi + 1] - abs[lo + 1];
    kinds[i] =
      Math.abs(netTurn) >= CIRCLING_NET_TURN ? 'thermalling' : absTurn < STRAIGHT_MAX_TURN ? 'gliding' : 'searching';
  }
  return kinds;
}

function toRuns(kinds: PhaseKind[]): Phase[] {
  const runs: Phase[] = [];
  kinds.forEach((kind, i) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.end = i;
    else runs.push({ kind, start: i, end: i });
  });
  return runs;
}

/**
 * The centred window marks fixes up to half a window before and after circling as
 * thermalling. Hand edge fixes that are not turning themselves to the neighbouring phase.
 */
function trimThermalEdges(fixes: Fix[], turn: number[], kinds: PhaseKind[]): PhaseKind[] {
  const out = [...kinds];
  const turning = (i: number) => {
    const dt = i === 0 ? 0 : (fixes[i].t - fixes[i - 1].t) / 1000;
    return dt > 0 && Math.abs(turn[i]) / dt >= THERMAL_EDGE_TURN_RATE;
  };
  for (const run of toRuns(kinds)) {
    if (run.kind !== 'thermalling') continue;
    const before = run.start > 0 ? kinds[run.start - 1] : null;
    const after = run.end < kinds.length - 1 ? kinds[run.end + 1] : null;
    let s = run.start;
    let e = run.end;
    if (before) while (s < e && !turning(s)) out[s++] = before;
    if (after) while (e > s && !turning(e)) out[e--] = after;
  }
  return out;
}

function duration(fixes: Fix[], p: Phase): number {
  return (fixes[p.end].t - fixes[p.start].t) / 1000;
}

function coalesce(runs: Phase[]): Phase[] {
  return runs.reduce<Phase[]>((out, p) => {
    const last = out[out.length - 1];
    if (last && last.kind === p.kind) last.end = p.end;
    else out.push({ ...p });
    return out;
  }, []);
}

/** Absorbs short runs into the longer neighbour until all runs are long enough. */
function absorbShortRuns(fixes: Fix[], runs: Phase[]): Phase[] {
  for (;;) {
    if (runs.length < 2) return runs;
    let shortest = -1;
    for (let i = 0; i < runs.length; i++) {
      const d = duration(fixes, runs[i]);
      if (d < MIN_PHASE_DURATION && (shortest < 0 || d < duration(fixes, runs[shortest]))) shortest = i;
    }
    if (shortest < 0) return runs;

    // Thermal boundaries come from trimThermalEdges; never grow a thermal with non-circling fixes.
    const run = runs[shortest];
    const eligible = (p: Phase | undefined) =>
      p && (run.kind === 'thermalling' || p.kind !== 'thermalling') ? p : undefined;
    const prev = eligible(runs[shortest - 1]);
    const next = eligible(runs[shortest + 1]);
    const target =
      prev && next
        ? duration(fixes, prev) >= duration(fixes, next)
          ? prev
          : next
        : (prev ?? next ?? runs[shortest - 1] ?? runs[shortest + 1]);
    target.start = Math.min(target.start, runs[shortest].start);
    target.end = Math.max(target.end, runs[shortest].end);
    runs.splice(shortest, 1);
    runs = coalesce(runs);
  }
}

/** Segments a flight into contiguous thermalling / gliding / searching phases. */
export function detectPhases(fixes: Fix[], heading: number[]): Phase[] {
  if (fixes.length === 0) return [];
  const turn = turns(heading);
  return absorbShortRuns(fixes, toRuns(trimThermalEdges(fixes, turn, classify(fixes, turn))));
}
