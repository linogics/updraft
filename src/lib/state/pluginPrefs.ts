export type PluginDock = 'left' | 'right' | 'bottom';

/** What the studio knows about a plugin without importing it, so a hidden plugin costs nothing. */
export interface PluginEntry {
  url: string;
  id: string;
  name: string;
  dock: PluginDock;
}

export const PLUGIN_ID = /^[a-z0-9-]{1,40}$/;
export const PLUGIN_DOCKS: readonly PluginDock[] = ['left', 'right', 'bottom'];

/** Only http(s) pages can be imported. Returns the normalised URL or null. */
export function pluginUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  try {
    const url = new URL(raw.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
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
      !PLUGIN_DOCKS.includes(o.dock as PluginDock) ||
      ids.has(o.id) ||
      urls.has(url)
    )
      continue;
    ids.add(o.id);
    urls.add(url);
    out.push({ url, id: o.id, name, dock: o.dock as PluginDock });
  }

  return out;
}
