// Framework-free domain types. Everything here is plain JSON so it can be stored
// in IndexedDB now and sent to / computed on a server later.

import type { ClubStats } from '../club/stats';
import type { Fix, Flight as PublicFlight } from '../plugins/api';

export type { Fix };

/** The stored flight. The shape plugins see, plus the club figures the app computes. */
export interface Flight extends PublicFlight {
  /** Figures the club shows without the track. Present while `shared` is true. */
  club?: ClubStats;
}

export type PhaseKind = 'thermalling' | 'gliding' | 'searching';

export interface Phase {
  kind: PhaseKind;
  /** Inclusive fix index range. */
  start: number;
  end: number;
}

export interface Thermal {
  start: number;
  end: number;
  /** Seconds. */
  duration: number;
  entryAlt: number;
  exitAlt: number;
  gain: number;
  /** m/s. */
  avgClimb: number;
  maxClimb: number;
  centerLat: number;
  centerLon: number;
}

export interface FlightStats {
  /** Seconds. */
  duration: number;
  /** Metres along the track. */
  trackLength: number;
  /** Metres, straight line takeoff to landing. */
  straightDistance: number;
  /** Metres, furthest point from takeoff. */
  maxDistanceFromTakeoff: number;
  maxAlt: number;
  minAlt: number;
  takeoffAlt: number;
  landingAlt: number;
  maxClimb: number;
  maxSink: number;
  /** Share of time per phase, 0..1. */
  phaseShare: Record<PhaseKind, number>;
  /** Average glide ratio over gliding phases, null if none. */
  glideRatio: number | null;
}

/** Per-fix derived series plus segment analysis. Arrays align with Flight.fixes. */
export interface FlightAnalysis {
  vario: number[];
  /** Ground speed in m/s. */
  speed: number[];
  /** Track heading in degrees 0..360. */
  heading: number[];
  phases: Phase[];
  thermals: Thermal[];
  stats: FlightStats;
}
