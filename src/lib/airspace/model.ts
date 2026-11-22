import { formatAlt, type Units } from '../ui/units';

export type LimitRef = 'GND' | 'MSL' | 'STD';
export interface Limit {
  /** Metres. */
  value: number;
  ref: LimitRef;
}

const FOOT = 0.3048;

/** Converts an openAIP limit. FL is hundreds of feet on the standard datum. Unknown units count as metres. */
export function limitOf(value: number, unit: string, datum: string): Limit {
  if (unit === 'FL') return { value: value * 100 * FOOT, ref: 'STD' };
  const metres = unit === 'FT' ? value * FOOT : value;
  return { value: metres, ref: datum === 'GND' ? 'GND' : datum === 'STD' ? 'STD' : 'MSL' };
}

export const AIRSPACE_CLASSES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'other'] as const;
export type AirspaceClass = (typeof AIRSPACE_CLASSES)[number];

export function classOf(icao: unknown): AirspaceClass {
  const c = typeof icao === 'string' ? icao.toUpperCase() : '';
  return c.length === 1 && (AIRSPACE_CLASSES as readonly string[]).includes(c) ? (c as AirspaceClass) : 'other';
}

export const CLASS_COLORS: Record<AirspaceClass, string> = {
  A: '#c62828',
  B: '#e53935',
  C: '#8e24aa',
  D: '#1565c0',
  E: '#42a5f5',
  F: '#26a69a',
  G: '#9ccc65',
  other: '#757575'
};

export function formatLimit(limit: Limit, units: Units): string {
  if (limit.ref === 'STD') return `FL ${Math.round(limit.value / (100 * FOOT))}`;
  if (limit.ref === 'GND') return limit.value === 0 ? 'GND' : `${formatAlt(limit.value, units)} AGL`;
  return `${formatAlt(limit.value, units)} MSL`;
}

/** Feature properties as they come from the openAIP tiles. */
export type AirspaceProps = Record<string, unknown>;

export function airspaceLabel(p: AirspaceProps, units: Units): string {
  const lim = (side: 'lower' | 'upper') =>
    formatLimit(
      limitOf(Number(p[`${side}_limit_value`]) || 0, String(p[`${side}_limit_unit`]), String(p[`${side}_limit_reference_datum`])),
      units
    );
  const cls = classOf(p.icao_class);
  return `${String(p.name ?? 'Airspace')}, ${cls === 'other' ? 'no class' : `class ${cls}`}, ${lim('lower')} to ${lim('upper')}`;
}

/** Same rule as the 2D filter: class shown and floor not above the limit. GND floors count as 0. */
export function isVisible(p: AirspaceProps, prefs: { classes: AirspaceClass[]; maxFloor: number }): boolean {
  const lower = limitOf(Number(p.lower_limit_value) || 0, String(p.lower_limit_unit), String(p.lower_limit_reference_datum));
  return prefs.classes.includes(classOf(p.icao_class)) && (lower.ref === 'GND' ? 0 : lower.value) <= prefs.maxFloor;
}

/**
 * Floor and ceiling in metres, scaled like the tracks.
 * shortcut: FL (STD) and AGL ceilings are treated as MSL, GND floors start at 0 m. Upgrade with terrain sampling.
 */
export function volumeHeights(p: AirspaceProps, exaggeration: number): { floor: number; ceiling: number } {
  const h = (side: 'lower' | 'upper') => {
    const l = limitOf(Number(p[`${side}_limit_value`]) || 0, String(p[`${side}_limit_unit`]), String(p[`${side}_limit_reference_datum`]));
    return (l.ref === 'GND' && side === 'lower' ? 0 : l.value) * exaggeration;
  };
  return { floor: h('lower'), ceiling: h('upper') };
}
