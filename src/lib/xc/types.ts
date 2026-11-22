import type { LatLon } from '../domain/geo';
import type { XcLeague } from '../state/xcPrefs';

export interface XcScore {
  league: XcLeague;
  /** Free distance, flat or FAI triangle, or out-and-return. */
  type: 'free' | 'flat' | 'fai' | 'oar';
  /** Scored distance in metres, before the multiplier. */
  distance: number;
  multiplier: number;
  points: number;
  /** Route in order, including start and end points. Triangles repeat the first point at the end. */
  turnpoints: LatLon[];
  /** Triangle closing gap, drawn as a circle on its diameter. */
  closing?: { center: LatLon; radius: number };
}
