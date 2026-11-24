import { clampPanel, PANEL_LIMITS, parsePanelPrefs, type PanelPrefsValue, type PanelSize } from './panelPrefs';

const KEY = 'panels';

// Storage can throw (private mode, blocked site data). Panels then start at their default sizes.
function load(): PanelPrefsValue {
  try {
    return parsePanelPrefs(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return parsePanelPrefs(null);
  }
}

/** Studio panel sizes and open state, kept in this browser (not in the shareable scene URL). */
class PanelPrefs {
  value = $state<PanelPrefsValue>(typeof localStorage === 'undefined' ? parsePanelPrefs(null) : load());

  resize(key: PanelSize, v: number) {
    this.save({ ...this.value, [key]: clampPanel(key, v) });
  }

  reset(key: PanelSize) {
    this.resize(key, PANEL_LIMITS[key].initial);
  }

  toggle(key: 'outlinerOpen' | 'sideOpen' | 'footerOpen') {
    this.save({ ...this.value, [key]: !this.value[key] });
  }

  private save(next: PanelPrefsValue) {
    this.value = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not persisted, the size still applies for this session.
    }
  }
}

export const panelPrefs = new PanelPrefs();
