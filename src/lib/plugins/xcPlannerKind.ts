import type { LeagueRule, PlanExport, PlanLeague, PlanRoute, XcPlannerPlugin } from './api';
import { EXTENSION } from './converterKind';

export type { LeagueRule, PlanExport, PlanLeague, PlanRoute, XcPlannerPlugin };

/** apiVersion of the xc-planner kind. */
export const XC_PLANNER_API_VERSION = 1;

const MAX_EXPORTS = 10;
const MAX_LEAGUES = 20;
const MAX_RULES = 10;
const LEAGUE_ID = /^[a-z0-9-]{1,40}$/;
const RULE_TYPES: readonly string[] = ['free', 'flat', 'fai', 'oar', 'oar2'];

/** What the app keeps about one export without importing the plugin. */
export interface PlanExportMeta {
  label: string;
  extension: string;
  mime?: string;
}

const isText = (v: unknown): v is string => typeof v === 'string' && !!v.trim();

const isMeta = (e: unknown) => {
  const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
  return (
    isText(o.label) &&
    typeof o.extension === 'string' &&
    EXTENSION.test(o.extension) &&
    (o.mime === undefined || isText(o.mime))
  );
};

/** Checks the stored export list of an xc-planner entry. */
export const isPlanExportMetas = (v: unknown): v is PlanExportMeta[] =>
  Array.isArray(v) &&
  v.length >= 1 &&
  v.length <= MAX_EXPORTS &&
  v.every(isMeta) &&
  new Set(v.map((e: PlanExportMeta) => e.extension)).size === v.length;

/** The stored part of an xc-planner entry, or null when it has neither valid exports nor valid leagues. */
export function planMeta(o: Record<string, unknown>): { exports?: PlanExportMeta[]; leagues?: PlanLeague[] } | null {
  const out: { exports?: PlanExportMeta[]; leagues?: PlanLeague[] } = {};
  if (o.exports !== undefined) {
    if (!isPlanExportMetas(o.exports)) return null;
    out.exports = o.exports.map(({ label, extension, mime }) => ({
      label: label.trim(),
      extension,
      ...(mime !== undefined && { mime })
    }));
  }

  if (o.leagues !== undefined) {
    try {
      out.leagues = parseLeagues(o.leagues);
    } catch {
      return null;
    }
  }

  return out.exports || out.leagues ? out : null;
}

/** Checks the xc-planner specific fields. */
export function validateXcPlannerPlugin(p: Record<string, unknown>): XcPlannerPlugin {
  if (p.apiVersion !== XC_PLANNER_API_VERSION) {
    throw new Error(
      `Unsupported apiVersion ${String(p.apiVersion)}, xc-planner plugins support ${XC_PLANNER_API_VERSION}.`
    );
  }

  const list = p.exports;
  if (p.leagues !== undefined) parseLeagues(p.leagues);
  if (list === undefined && p.leagues !== undefined) return p as unknown as XcPlannerPlugin;

  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_EXPORTS) {
    throw new Error(`"exports" must be a list of 1 to ${MAX_EXPORTS} task file formats, or "leagues" must be given.`);
  }

  for (const e of list as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') throw new Error('Every export must be an object.');
    if (!isText(e.label)) throw new Error('Every export needs a non-empty "label".');

    if (typeof e.extension !== 'string' || !EXTENSION.test(e.extension)) {
      throw new Error('Every export "extension" must be lower case, 1 to 10 characters from a-z and 0-9.');
    }

    if (e.mime !== undefined && !isText(e.mime)) throw new Error('An export "mime" must be a non-empty string.');
    if (typeof e.write !== 'function') throw new Error('Every export needs a "write" function.');
  }

  if (new Set(list.map((e: PlanExport) => e.extension)).size !== list.length) {
    throw new Error('The export extensions of one plugin must be unique.');
  }

  return p as unknown as XcPlannerPlugin;
}

const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${what} must be an object.`);
  return v as Record<string, unknown>;
};

/** A finite number in the range, `above` makes the lower bound exclusive. */
function range(v: unknown, what: string, min: number, max: number, above = false): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v > max || (above ? v <= min : v < min)) {
    throw new Error(`${what} must be a number ${above ? 'above' : 'from'} ${min} ${above ? 'and' : 'to'} ${max}.`);
  }

  return v;
}

function parseRule(raw: unknown, where: string): LeagueRule {
  const r = obj(raw, where);
  if (!isText(r.name)) throw new Error(`${where} needs a non-empty "name".`);
  const w = `${where} "${r.name.trim()}"`;
  if (typeof r.type !== 'string' || !RULE_TYPES.includes(r.type)) {
    throw new Error(`${w}: "type" must be one of ${RULE_TYPES.join(', ')}.`);
  }

  const type = r.type as LeagueRule['type'];
  const out: LeagueRule = {
    name: r.name.trim(),
    type,
    multiplier: range(r.multiplier, `${w}: "multiplier"`, 0, 10, true)
  };

  if (r.minSide !== undefined) {
    if (type !== 'flat' && type !== 'fai') throw new Error(`${w}: "minSide" is only for flat and fai rules.`);
    out.minSide = range(r.minSide, `${w}: "minSide"`, 0, 0.5, true);
    if (out.minSide >= 0.5) throw new Error(`${w}: "minSide" must be below 0.5.`);
  }

  if (r.maxSide !== undefined) {
    if (type !== 'flat') throw new Error(`${w}: "maxSide" is only for flat rules.`);
    out.maxSide = range(r.maxSide, `${w}: "maxSide"`, 0, 1, true);
    if (out.minSide !== undefined && out.maxSide <= out.minSide) {
      throw new Error(`${w}: "maxSide" must be above "minSide".`);
    }
  }

  if (r.minDistance !== undefined) out.minDistance = range(r.minDistance, `${w}: "minDistance"`, 0, 1000);

  if (r.closing !== undefined) {
    if (type === 'free') throw new Error(`${w}: "closing" is not for free rules.`);
    const c = obj(r.closing, `${w}: "closing"`);
    out.closing = {};
    for (const k of ['fixed', 'free'] as const) {
      if (c[k] !== undefined) out.closing[k] = range(c[k], `${w}: "closing.${k}"`, 0, 100);
    }

    if (c.relative !== undefined) out.closing.relative = range(c.relative, `${w}: "closing.relative"`, 0, 1);
  }

  if (r.cylinders !== undefined) out.cylinders = range(r.cylinders, `${w}: "cylinders"`, 0, 5);

  if (r.decimals !== undefined) {
    if (r.decimals !== 1 && r.decimals !== 2) throw new Error(`${w}: "decimals" must be 1 or 2.`);
    out.decimals = r.decimals;
  }

  return out;
}

/** Validates a league list and returns a copy, unknown keys are dropped. Throws an Error naming the problem. */
export function parseLeagues(raw: unknown): PlanLeague[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_LEAGUES) {
    throw new Error(`"leagues" must be a list of 1 to ${MAX_LEAGUES} leagues.`);
  }

  const ids = new Set<string>();
  return raw.map((l, i) => {
    const o = obj(l, `League ${i + 1}`);
    const id = o.id;
    if (typeof id !== 'string' || !LEAGUE_ID.test(id)) {
      throw new Error('Every league "id" must be 1 to 40 characters from a-z, 0-9 and "-".');
    }

    if (ids.has(id)) throw new Error(`The league id "${id}" is used twice.`);
    ids.add(id);
    if (!isText(o.label)) throw new Error(`League "${id}" needs a non-empty "label".`);

    if (!Array.isArray(o.rules) || o.rules.length < 1 || o.rules.length > MAX_RULES) {
      throw new Error(`League "${id}": "rules" must be a list of 1 to ${MAX_RULES} rules.`);
    }

    return {
      id,
      label: o.label.trim(),
      rules: o.rules.map((r, j) => parseRule(r, `League "${id}" rule ${j + 1}`))
    };
  });
}
