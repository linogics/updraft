import type { LatLon } from '../domain/geo';
import type { XcLeague } from '../state/xcPrefs';
import type { XcScore } from './types';

interface Pt {
  x: number;
  y: number;
}

/** The part of an igc-xc-score solution we read. Distances are km, points are lon (x) / lat (y). */
export interface RawSolution {
  score?: number;
  opt: { scoring: { code: string; multiplier: number } };
  scoreInfo?: { distance: number; tp?: Pt[]; ep?: { start: Pt; finish: Pt }; cp?: { d: number; in: Pt; out: Pt } };
}

const TYPES: Record<string, XcScore['type']> = { od: 'free', tri: 'flat', fai: 'fai', oar: 'oar' };
const ll = (p: Pt): LatLon => ({ lat: p.y, lon: p.x });

/** Maps a solver result to our plain type. Null when nothing was scored. */
export function mapResult(league: XcLeague, s: RawSolution): XcScore | null {
  const info = s.scoreInfo;
  const type = TYPES[s.opt.scoring.code];
  if (!info?.tp?.length || !type || !s.score) return null;
  const closed = type === 'flat' || type === 'fai';
  const cp = info.cp;
  const points = [...info.tp];
  if (info.ep) (points.unshift(info.ep.start), points.push(info.ep.finish));
  if (type === 'oar' && cp) (points.unshift(cp.in), points.push(cp.out));
  if (closed) points.push(info.tp[0]);
  return {
    league,
    type,
    distance: info.distance * 1000,
    multiplier: s.opt.scoring.multiplier,
    points: s.score,
    turnpoints: points.map(ll),
    closing:
      closed && cp
        ? { center: { lat: (cp.in.y + cp.out.y) / 2, lon: (cp.in.x + cp.out.x) / 2 }, radius: (cp.d * 1000) / 2 }
        : undefined
  };
}
