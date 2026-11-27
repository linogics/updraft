import { LOCAL_HOSTS, PLUGIN_ID } from '#lib/plugins/core';

export interface SyncConfig {
  /** Backend plugin id. */
  backend: string;
  url: string;
}

const KEY = 'syncConfig';

/** Config files and stored values are untrusted, so every field is checked. Returns null when unusable. */
export function parseSyncConfig(raw: unknown): SyncConfig | null {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (typeof o.backend !== 'string' || !PLUGIN_ID.test(o.backend) || typeof o.url !== 'string') return null;

  const url = syncUrl(o.url);
  return url ? { backend: o.backend, url } : null;
}

/** https only, plain http just for a server on this machine. Returns the URL without a trailing slash. */
export function syncUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const ok = u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL_HOSTS.includes(u.hostname));
    return ok ? u.href.replace(/\/+$/, '') : null;
  } catch {
    return null;
  }
}

/** The optional deploy preset. A missing file, a fallback HTML page or bad content all mean no preset. */
export async function fetchPreset(): Promise<SyncConfig | null> {
  try {
    // no-cache so a self-hoster's change shows up without clearing the browser cache.
    const res = await fetch('/config.json', { cache: 'no-cache' });
    if (!res.ok) return null;

    return parseSyncConfig(((await res.json()) as { sync?: unknown } | null)?.sync);
  } catch {
    return null;
  }
}

// Storage can throw (private mode, blocked site data), so every access is guarded.
export function readOverride(): SyncConfig | null {
  try {
    return parseSyncConfig(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return null;
  }
}

export function writeOverride(config: SyncConfig | null) {
  try {
    if (config) localStorage.setItem(KEY, JSON.stringify(config));
    else localStorage.removeItem(KEY);
  } catch {
    // Not persisted, the connection lasts for this session.
  }
}

/** The user's choice wins over the deploy preset. */
export async function loadSyncConfig(): Promise<{ config: SyncConfig | null; preset: SyncConfig | null }> {
  const preset = await fetchPreset();
  return { config: readOverride() ?? preset, preset };
}
