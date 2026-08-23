import { distance } from '../geo';
import type { Fix, FlightStats, Phase, PhaseKind } from '../model';

function seconds(a: Fix, b: Fix): number {
  return (b.t - a.t) / 1000;
}

/** Whole-flight figures. Expects at least one fix. */
export function computeStats(fixes: Fix[], vario: number[], phases: Phase[]): FlightStats {
  const takeoff = fixes[0];
  const landing = fixes[fixes.length - 1];

  let trackLength = 0;
  let maxDistanceFromTakeoff = 0;
  let maxAlt = -Infinity;
  let minAlt = Infinity;
  for (let i = 0; i < fixes.length; i++) {
    const f = fixes[i];
    if (i > 0) trackLength += distance(fixes[i - 1], f);
    maxDistanceFromTakeoff = Math.max(maxDistanceFromTakeoff, distance(takeoff, f));
    maxAlt = Math.max(maxAlt, f.alt);
    minAlt = Math.min(minAlt, f.alt);
  }

  const duration = seconds(takeoff, landing);
  const phaseTime: Record<PhaseKind, number> = { thermalling: 0, gliding: 0, searching: 0 };
  let glideDistance = 0;
  let glideAltLoss = 0;
  for (const p of phases) {
    phaseTime[p.kind] += seconds(fixes[p.start], fixes[p.end]);
    if (p.kind !== 'gliding') continue;
    for (let i = p.start + 1; i <= p.end; i++) glideDistance += distance(fixes[i - 1], fixes[i]);
    glideAltLoss += fixes[p.start].alt - fixes[p.end].alt;
  }
  // Gaps between phases (one fix interval each) are not attributed; normalise by the attributed total.
  const attributed = phaseTime.thermalling + phaseTime.gliding + phaseTime.searching;
  const share = (k: PhaseKind) => (attributed > 0 ? phaseTime[k] / attributed : 0);

  return {
    duration,
    trackLength,
    straightDistance: distance(takeoff, landing),
    maxDistanceFromTakeoff,
    maxAlt,
    minAlt,
    takeoffAlt: takeoff.alt,
    landingAlt: landing.alt,
    maxClimb: vario.reduce((m, v) => Math.max(m, v), -Infinity),
    maxSink: vario.reduce((m, v) => Math.min(m, v), Infinity),
    phaseShare: { thermalling: share('thermalling'), gliding: share('gliding'), searching: share('searching') },
    glideRatio: glideAltLoss > 0 ? glideDistance / glideAltLoss : null
  };
}
