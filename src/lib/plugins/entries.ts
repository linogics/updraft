import { PLUGIN_DOCKS, PLUGIN_HOSTS, type PluginDock, type PluginHost } from '#lib/studio/plugins';

import { type ConverterMeta, isConverterMeta } from './converterKind';
import { PLUGIN_ID, PLUGIN_KINDS, type PluginKind, pluginUrl } from './core';

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
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    if (
      !url ||
      typeof o.id !== 'string' ||
      !PLUGIN_ID.test(o.id) ||
      !name ||
      !PLUGIN_KINDS.includes(o.kind as PluginKind) ||
      (o.kind === 'studio' && !PLUGIN_DOCKS.includes(o.dock as PluginDock)) ||
      (o.kind === 'converter' && !isConverterMeta(o)) ||
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

    if (Array.isArray(o.hosts) && o.hosts.every((h) => PLUGIN_HOSTS.includes(h as PluginHost))) {
      entry.hosts = o.hosts as PluginHost[];
    }

    out.push(entry);
  }

  return out;
}
