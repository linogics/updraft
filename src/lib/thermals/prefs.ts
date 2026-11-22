export interface ThermalOverlayPrefsValue {
  hotspots: boolean;
  skyways: boolean;
  opacity: number;
}

/** Validates stored prefs field by field. Anything invalid falls back to the default. */
export function parseThermalOverlayPrefs(raw: unknown): ThermalOverlayPrefsValue {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const opacity = typeof o.opacity === 'number' && Number.isFinite(o.opacity) ? Math.min(1, Math.max(0.1, o.opacity)) : 0.6;
  return { hotspots: o.hotspots === true, skyways: o.skyways === true, opacity };
}
