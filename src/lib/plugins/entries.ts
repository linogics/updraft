import { PLUGIN_DOCKS, PLUGIN_HOSTS, type PluginDock, type PluginHost } from '#lib/studio/plugins';

import type { PlanLeague } from './api';
import { type BadgeMeta, badgeMetas, isBadgeMetas } from './badgeKind';
import { type ConverterMeta, isConverterMeta } from './converterKind';
import { PLUGIN_ID, PLUGIN_KINDS, type PluginKind, pluginUrl } from './core';
import { type PlanExportMeta, planMeta } from './xcPlannerKind';

/** What the app knows about a plugin without importing it, so a hidden plugin costs nothing. */
export interface PluginEntry extends Partial<ConverterMeta> {
  url: string;
  id: string;
  name: string;
  kind: PluginKind;
  /** Required for the studio kind. */
  dock?: PluginDock;
  /** Pages that show a studio plugin, missing means the studio only. */
  hosts?: PluginHost[];
  /** The xc-planner kind stores `exports` as `{ label, extension, mime? }` in plugin order, when it has any. */
  exports?: PlanExportMeta[];
  /** The xc-planner kind stores its validated leagues too, so scoring never imports the plugin. */
  leagues?: PlanLeague[];
  /** The badge kind stores its badges without `value`, so lists never import the plugin. */
  badges?: BadgeMeta[];
  /** The converter kind also stores `label`, `extensions`, `canRead` and `canWrite`, and optionally `mime`. */
}

/** Validates the stored plugin list entry by entry. Bad entries and repeated ids or URLs are dropped. */
export function parsePlugins(raw: unknown): PluginEntry[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const urls = new Set<string>();
  const out: PluginEntry[] = [];
  for (const e of raw) {
    const o = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    const url = pluginUrl(o.url);
    const plan = o.kind === 'xc-planner' ? planMeta(o) : null;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (
      !url ||
      typeof o.id !== 'string' ||
      !PLUGIN_ID.test(o.id) ||
      !name ||
      !PLUGIN_KINDS.includes(o.kind as PluginKind) ||
      (o.kind === 'studio' && !PLUGIN_DOCKS.includes(o.dock as PluginDock)) ||
      (o.kind === 'converter' && !isConverterMeta(o)) ||
      (o.kind === 'xc-planner' && !plan) ||
      (o.kind === 'badge' && !isBadgeMetas(o.badges)) ||
      ids.has(o.id) ||
      urls.has(url)
    ) {
      continue;
    }

    ids.add(o.id);
    urls.add(url);
    const entry: PluginEntry = { url, id: o.id, name, kind: o.kind as PluginKind };
    if (o.kind === 'studio') entry.dock = o.dock as PluginDock;

    if (o.kind === 'converter') {
      const { label, extensions, canRead, canWrite, mime } = o as unknown as ConverterMeta;
      Object.assign(entry, { label: label.trim(), extensions, canRead, canWrite });
      if (mime !== undefined) entry.mime = mime;
    }

    if (o.kind === 'badge') entry.badges = badgeMetas(o.badges as BadgeMeta[]);

    if (plan) Object.assign(entry, plan);

    if (Array.isArray(o.hosts) && o.hosts.every((h) => PLUGIN_HOSTS.includes(h as PluginHost))) {
      entry.hosts = o.hosts as PluginHost[];
    }

    out.push(entry);
  }

  return out;
}
