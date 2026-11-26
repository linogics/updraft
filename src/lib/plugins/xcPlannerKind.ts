import type { PlanExport, PlanRoute, XcPlannerPlugin } from './api';
import { EXTENSION } from './converterKind';

export type { PlanExport, PlanRoute, XcPlannerPlugin };

/** apiVersion of the xc-planner kind. */
export const XC_PLANNER_API_VERSION = 1;

const MAX_EXPORTS = 10;

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

/** Checks the xc-planner specific fields. */
export function validateXcPlannerPlugin(p: Record<string, unknown>): XcPlannerPlugin {
  if (p.apiVersion !== XC_PLANNER_API_VERSION) {
    throw new Error(
      `Unsupported apiVersion ${String(p.apiVersion)}, xc-planner plugins support ${XC_PLANNER_API_VERSION}.`
    );
  }

  // Leagues will count here too later, then this only fails when both are missing.
  const list = p.exports;
  if (!Array.isArray(list) || list.length < 1 || list.length > MAX_EXPORTS) {
    throw new Error(`"exports" must be a list of 1 to ${MAX_EXPORTS} task file formats.`);
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
