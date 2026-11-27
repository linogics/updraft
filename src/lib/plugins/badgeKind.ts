import type { BadgeDef, BadgeFlight, BadgePlugin, BadgeUnit } from './api';

export type { BadgeDef, BadgeFlight, BadgePlugin, BadgeUnit };

/** apiVersion of the badge kind. */
export const BADGE_API_VERSION = 1;

/** Thresholds per badge, one for every tier. */
export const TIER_COUNT = 8;

const BADGE_ID = /^[a-z0-9-]{1,40}$/;
const UNITS: readonly string[] = ['distance', 'speed', 'duration', 'altitude', 'vario', 'count'];

/** What the app keeps about one badge without importing the plugin. */
export type BadgeMeta = Omit<BadgeDef, 'value'>;

const isText = (v: unknown): v is string => typeof v === 'string' && !!v.trim();

const isThresholds = (v: unknown): v is number[] =>
  Array.isArray(v) &&
  v.length === TIER_COUNT &&
  v.every((n, i) => typeof n === 'number' && Number.isFinite(n) && n > 0 && (i === 0 || n > v[i - 1]));

const isMeta = (b: unknown) => {
  const o = (b && typeof b === 'object' ? b : {}) as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    BADGE_ID.test(o.id) &&
    isText(o.label) &&
    UNITS.includes(o.unit as string) &&
    isThresholds(o.thresholds)
  );
};

/** Checks the stored badge list of a badge entry. */
export const isBadgeMetas = (v: unknown): v is BadgeMeta[] =>
  Array.isArray(v) && v.length >= 1 && v.every(isMeta) && new Set(v.map((b: BadgeMeta) => b.id)).size === v.length;

/** The badge metadata of a plugin or stored entry, trimmed and without `value`. */
export const badgeMetas = (list: readonly BadgeMeta[]): BadgeMeta[] =>
  list.map(({ id, label, unit, thresholds }) => ({ id, label: label.trim(), unit, thresholds: [...thresholds] }));

/** Checks the badge specific fields. */
export function validateBadgePlugin(p: Record<string, unknown>): BadgePlugin {
  if (p.apiVersion !== BADGE_API_VERSION) {
    throw new Error(`Unsupported apiVersion ${String(p.apiVersion)}, badge plugins support ${BADGE_API_VERSION}.`);
  }

  if (!Array.isArray(p.badges) || p.badges.length < 1) throw new Error('"badges" must be a list of 1 or more badges.');

  const ids = new Set<string>();
  for (const b of p.badges as Record<string, unknown>[]) {
    if (!b || typeof b !== 'object') throw new Error('Every badge must be an object.');

    if (typeof b.id !== 'string' || !BADGE_ID.test(b.id)) {
      throw new Error('Every badge "id" must be 1 to 40 characters from a-z, 0-9 and "-".');
    }

    if (ids.has(b.id)) throw new Error(`The badge id "${b.id}" is used twice.`);
    ids.add(b.id);
    if (!isText(b.label)) throw new Error(`Badge "${b.id}" needs a non-empty "label".`);

    if (!UNITS.includes(b.unit as string)) {
      throw new Error(`Badge "${b.id}": "unit" must be one of ${UNITS.join(', ')}.`);
    }

    if (!isThresholds(b.thresholds)) {
      throw new Error(
        `Badge "${b.id}": "thresholds" must be ${TIER_COUNT} finite numbers above 0, each larger than the one before.`
      );
    }

    if (typeof b.value !== 'function') throw new Error(`Badge "${b.id}" needs a "value" function.`);
  }

  return p as unknown as BadgePlugin;
}
