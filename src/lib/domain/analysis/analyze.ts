import type { Flight, FlightAnalysis } from '../model';
import { detectPhases } from './phases';
import { computeSeries } from './series';
import { computeStats } from './stats';
import { extractThermals } from './thermals';

/** Runs the full analysis pipeline for one flight. Pure: safe to run in a worker or on a server. */
export function analyzeFlight(flight: Flight): FlightAnalysis {
  const { fixes } = flight;
  const { vario, speed, heading } = computeSeries(fixes);
  const phases = detectPhases(fixes, heading);
  return {
    vario,
    speed,
    heading,
    phases,
    thermals: extractThermals(fixes, vario, phases),
    stats: computeStats(fixes, vario, phases)
  };
}
