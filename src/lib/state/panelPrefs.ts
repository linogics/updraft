export interface PanelPrefsValue {
  /** Side panel width, px. */
  side: number;
  /** Bottom chart height, px. */
  footer: number;
  /** Share of the 3D view in split layout, 0..1. */
  split: number;
  sideOpen: boolean;
  footerOpen: boolean;
}

export const PANEL_LIMITS = {
  side: { min: 220, max: 640, initial: 320 },
  footer: { min: 80, max: 480, initial: 150 },
  split: { min: 0.2, max: 0.8, initial: 0.5 }
} as const;

export type PanelSize = keyof typeof PANEL_LIMITS;

export function clampPanel(key: PanelSize, v: number): number {
  const { min, max } = PANEL_LIMITS[key];
  return Math.min(max, Math.max(min, v));
}

/** Validates stored prefs field by field. Bad sizes fall back to the initial size, then get clamped. */
export function parsePanelPrefs(raw: unknown): PanelPrefsValue {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const size = (key: PanelSize) =>
    clampPanel(key, typeof o[key] === 'number' && Number.isFinite(o[key]) ? (o[key] as number) : PANEL_LIMITS[key].initial);
  return {
    side: size('side'),
    footer: size('footer'),
    split: size('split'),
    sideOpen: typeof o.sideOpen === 'boolean' ? o.sideOpen : true,
    footerOpen: typeof o.footerOpen === 'boolean' ? o.footerOpen : true
  };
}
