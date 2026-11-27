import { m } from '#lib/paraglide/messages';
import type { BadgeDef } from '#lib/plugins/badgeKind';
import { formatAirtime, formatNumber } from '#lib/ui/format';
import { formatAlt, formatDistance, formatSpeed, formatVario, type Units } from '#lib/ui/units';

import type { Tier } from './progress';
import { type BadgeGroup, BUILTIN_BADGE_PLUGIN } from './registry';

export const TIER_LABELS: Record<Tier, () => string> = {
  bronze: () => m.tier_bronze(),
  silver: () => m.tier_silver(),
  gold: () => m.tier_gold(),
  platinum: () => m.tier_platinum(),
  diamond: () => m.tier_diamond(),
  cloudbase: () => m.tier_cloudbase(),
  stratos: () => m.tier_stratos(),
  legend: () => m.tier_legend()
};

// Only the bundled plugin is translated, a plugin brings its own label.
const BADGE_LABELS: Record<string, () => string> = {
  'free-distance': () => m.badge_free_distance(),
  'xc-speed': () => m.badge_xc_speed(),
  'longest-flight': () => m.badge_longest_flight(),
  'total-airtime': () => m.badge_total_airtime(),
  flights: () => m.badge_flights(),
  'max-altitude': () => m.badge_max_altitude(),
  'max-gain': () => m.badge_max_gain(),
  'max-agl': () => m.badge_max_agl(),
  'best-climb': () => m.badge_best_climb(),
  'best-thermal-gain': () => m.badge_best_thermal_gain(),
  sites: () => m.badge_sites(),
  'biggest-triangle': () => m.badge_biggest_triangle(),
  triangles: () => m.badge_triangles(),
  'flight-days': () => m.badge_flight_days(),
  gliders: () => m.badge_gliders()
};

export const labelOf = (g: BadgeGroup, b: BadgeDef) =>
  (g.id === BUILTIN_BADGE_PLUGIN ? BADGE_LABELS[b.id]?.() : undefined) ?? b.label;

export function formatBadgeValue(unit: BadgeDef['unit'], v: number, u: Units): string {
  switch (unit) {
    case 'distance':
      return formatDistance(v, u);
    case 'speed':
      return formatSpeed(v, u);
    case 'duration':
      return formatAirtime(v * 1000);
    case 'altitude':
      return formatAlt(v, u);
    case 'vario':
      return formatVario(v, u);
    case 'count':
      return formatNumber(v);
  }
}
