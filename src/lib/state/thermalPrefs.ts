export interface ThermalPrefsValue {
  columns: boolean;
  labels: boolean;
}

/** Validates stored prefs field by field. Anything that is not a boolean falls back to shown. */
export function parseThermalPrefs(raw: unknown): ThermalPrefsValue {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    columns: typeof o.columns === 'boolean' ? o.columns : true,
    labels: typeof o.labels === 'boolean' ? o.labels : true
  };
}
