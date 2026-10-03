// Display units. Domain values stay SI (m, m/s); conversion happens only at the edge.

export const DISTANCE_UNITS = ['km', 'mi', 'nm'] as const;
export const ALT_UNITS = ['m', 'ft'] as const;
export const VARIO_UNITS = ['ms', 'fpm', 'kt'] as const;
export const SPEED_UNITS = ['kmh', 'mph', 'kt'] as const;

export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
export type AltUnit = (typeof ALT_UNITS)[number];
export type VarioUnit = (typeof VARIO_UNITS)[number];
export type SpeedUnit = (typeof SPEED_UNITS)[number];

export interface Units {
  distance: DistanceUnit;
  alt: AltUnit;
  vario: VarioUnit;
  speed: SpeedUnit;
}

export const UNIT_PRESETS = {
  metric: { distance: 'km', alt: 'm', vario: 'ms', speed: 'kmh' },
  imperial: { distance: 'mi', alt: 'ft', vario: 'fpm', speed: 'mph' },
  aviation: { distance: 'nm', alt: 'ft', vario: 'kt', speed: 'kt' }
} as const satisfies Record<string, Units>;

export type UnitPreset = keyof typeof UNIT_PRESETS;

export const UNIT_LABELS = {
  distance: { km: 'km', mi: 'mi', nm: 'nm' },
  alt: { m: 'm', ft: 'ft' },
  vario: { ms: 'm/s', fpm: 'ft/min', kt: 'kt' },
  speed: { kmh: 'km/h', mph: 'mph', kt: 'kt' }
} as const;

const FOOT = 0.3048;
const MILE = 1609.344;
const NAUTICAL_MILE = 1852;
const KNOT = NAUTICAL_MILE / 3600;

const ALT_FACTOR: Record<AltUnit, number> = { m: 1, ft: 1 / FOOT };
const VARIO_FACTOR: Record<VarioUnit, number> = { ms: 1, fpm: 60 / FOOT, kt: 1 / KNOT };
const SPEED_FACTOR: Record<SpeedUnit, number> = { kmh: 3.6, mph: 3600 / MILE, kt: 1 / KNOT };
const DISTANCE_FACTOR: Record<DistanceUnit, number> = { km: 1 / 1000, mi: 1 / MILE, nm: 1 / NAUTICAL_MILE };

export const toAlt = (m: number, u: AltUnit) => m * ALT_FACTOR[u];
export const fromAlt = (v: number, u: AltUnit) => v / ALT_FACTOR[u];
export const toVario = (ms: number, u: VarioUnit) => ms * VARIO_FACTOR[u];
export const fromVario = (v: number, u: VarioUnit) => v / VARIO_FACTOR[u];
export const toSpeed = (ms: number, u: SpeedUnit) => ms * SPEED_FACTOR[u];
export const toDistance = (m: number, u: DistanceUnit) => m * DISTANCE_FACTOR[u];

/** Rounds and drops the sign of zero, so tiny negatives read as 0 rather than -0. */
function round(v: number, step: number): number {
  return Math.round(v / step) * step || 0;
}

export function formatAlt(m: number, u: Units): string {
  return `${Math.round(toAlt(m, u.alt))} ${UNIT_LABELS.alt[u.alt]}`;
}

/** Signed climb rate: one decimal for m/s and kt, steps of 10 for ft/min. */
export function formatVario(ms: number, u: Units): string {
  const fpm = u.vario === 'fpm';
  const v = round(toVario(ms, u.vario), fpm ? 10 : 0.1);
  return `${v > 0 ? '+' : ''}${v.toFixed(fpm ? 0 : 1)} ${UNIT_LABELS.vario[u.vario]}`;
}

export function formatSpeed(ms: number, u: Units): string {
  return `${Math.round(toSpeed(ms, u.speed))} ${UNIT_LABELS.speed[u.speed]}`;
}

/** Below 1 km (metric) or 0.5 mi / 0.5 nm, short distances read better in m or ft. */
export function formatDistance(m: number, u: Units): string {
  const long = toDistance(m, u.distance);
  if (u.distance === 'km' ? long >= 1 : long >= 0.5) return `${long.toFixed(1)} ${UNIT_LABELS.distance[u.distance]}`;
  return u.distance === 'km' ? `${Math.round(m)} m` : `${Math.round(toAlt(m, 'ft'))} ft`;
}

export function presetOf(u: Units): UnitPreset | 'custom' {
  for (const [name, p] of Object.entries(UNIT_PRESETS) as [UnitPreset, Units][]) {
    if (p.distance === u.distance && p.alt === u.alt && p.vario === u.vario && p.speed === u.speed) return name;
  }
  return 'custom';
}

/** Validates stored units field by field; anything unknown falls back to metric. */
export function parseUnits(raw: unknown): Units {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(allowed: readonly T[], v: unknown, fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  const m = UNIT_PRESETS.metric;
  return {
    distance: pick(DISTANCE_UNITS, o.distance, m.distance),
    alt: pick(ALT_UNITS, o.alt, m.alt),
    vario: pick(VARIO_UNITS, o.vario, m.vario),
    speed: pick(SPEED_UNITS, o.speed, m.speed)
  };
}
