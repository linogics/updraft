import { parseThermalOverlayPrefs, type ThermalOverlayPrefsValue } from './prefs';

const KEY = 'thermalOverlayPrefs';

// Storage can throw (private mode, blocked site data). Prefs then just reset to the defaults.
function load(): ThermalOverlayPrefsValue {
  try {
    return parseThermalOverlayPrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parseThermalOverlayPrefs(null);
  }
}

const initial = typeof localStorage === 'undefined' ? parseThermalOverlayPrefs(null) : load();

/** Thermal hotspot and skyway overlay prefs, kept in this browser (not in the shareable URL). */
class ThermalOverlayPrefs {
  hotspots = $state(initial.hotspots);
  skyways = $state(initial.skyways);
  opacity = $state(initial.opacity);

  set(patch: Partial<ThermalOverlayPrefsValue>) {
    Object.assign(this, patch);
    try {
      localStorage.setItem(KEY, JSON.stringify({ hotspots: this.hotspots, skyways: this.skyways, opacity: this.opacity }));
    } catch {
      // Not persisted, the choice still applies for this session.
    }
  }
}

export const thermalOverlayPrefs = new ThermalOverlayPrefs();
