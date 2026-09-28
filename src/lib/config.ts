export interface RuntimeConfig {
  cesiumIonToken: string;
}

let cached: Promise<RuntimeConfig> | undefined;

/** Runtime config served as /config.json (Caddy in prod, Vite middleware in dev). */
export function loadRuntimeConfig(): Promise<RuntimeConfig> {
  cached ??= fetch('/config.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((c: Partial<RuntimeConfig>) => ({ cesiumIonToken: c.cesiumIonToken ?? '' }));
  return cached;
}
