// Framework-free domain types. Everything here is plain JSON so it can be stored
// in IndexedDB now and sent to / computed on a server later.

export interface Fix {
  /** Unix epoch milliseconds (UTC). */
  t: number;
  lat: number;
  lon: number;
  /** Altitude in metres as recorded (GPS, or pressure altitude as fallback). */
  alt: number;
}

export interface Flight {
  id: string;
  sourceName: string;
  pilot: string;
  glider: string | null;
  site: string | null;
  /** Flight date, ISO 8601 (YYYY-MM-DD). */
  date: string;
  /** Free text, edited in the logbook. */
  notes?: string;
  fixes: Fix[];
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
