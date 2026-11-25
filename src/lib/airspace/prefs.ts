import { AIRSPACE_CLASSES, type AirspaceClass } from './model';

export interface AirspacePrefsValue {
  show: boolean;
  classes: AirspaceClass[];
  /** Metres. Airspaces whose floor is above this are hidden. */
  maxFloor: number;
  opacity: number;
}

export const MAX_FLOOR_LIMIT = 6000;

/** Validates stored prefs field by field. Anything invalid falls back to the default. */
export function parseAirspacePrefs(raw: unknown): AirspacePrefsValue {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, lo: number, hi: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  return {
    show: typeof o.show === 'boolean' ? o.show : true,
    classes: Array.isArray(o.classes)
      ? AIRSPACE_CLASSES.filter((c) => (o.classes as unknown[]).includes(c))
      : [...AIRSPACE_CLASSES],
    maxFloor: num(o.maxFloor, 0, MAX_FLOOR_LIMIT, 4000),
    opacity: num(o.opacity, 0.1, 0.6, 0.25)
  };
}
