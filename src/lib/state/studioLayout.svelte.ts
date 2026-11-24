import { PANEL_DEFAULTS, type Dock } from '#lib/studio/panels';
import {
  clampSize,
  hideInLayout,
  LAYOUT_LIMITS,
  moveInLayout,
  parseStudioLayout,
  type LayoutSize,
  type StudioLayoutValue
} from './studioLayout';

const KEY = 'studioLayout';

// Storage can throw (private mode, blocked site data). The layout then starts at its defaults.
function load(): StudioLayoutValue {
  try {
    return parseStudioLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null'), PANEL_DEFAULTS);
  } catch {
    return parseStudioLayout(null, PANEL_DEFAULTS);
  }
}

/** Studio dock layout, kept in this browser (not in the shareable scene URL). */
class StudioLayout {
  value = $state<StudioLayoutValue>(
    typeof localStorage === 'undefined' ? parseStudioLayout(null, PANEL_DEFAULTS) : load()
  );
  /** Bottom tab picked for this session only, for example the timeline when flights span several days. */
  private sessionTab = $state<string | null>(null);
  /** Where a hidden panel returns to. Not persisted, a reload puts it back in its default dock. */
  private lastDock = new Map<string, Dock>();

  get activeTab(): string | null {
    const bottom = this.value.docks.bottom;
    return [this.sessionTab, this.value.tab].find((id) => id && bottom.includes(id)) ?? bottom[0] ?? null;
  }

  move(id: string, dock: Dock, index: number) {
    this.save(moveInLayout(this.value, id, dock, index));
  }

  hide(id: string) {
    const dock = (['left', 'right', 'bottom'] as const).find((d) => this.value.docks[d].includes(id));
    if (!dock) return;
    this.lastDock.set(id, dock);
    this.save(hideInLayout(this.value, id));
  }

  show(id: string) {
    this.move(id, this.lastDock.get(id) ?? PANEL_DEFAULTS[id], Infinity);
  }

  resize(key: LayoutSize, v: number) {
    this.save({ ...this.value, sizes: { ...this.value.sizes, [key]: clampSize(key, v) } });
  }

  reset(key: LayoutSize) {
    this.resize(key, LAYOUT_LIMITS[key].initial);
  }

  toggleDock(dock: Dock) {
    this.save({ ...this.value, open: { ...this.value.open, [dock]: !this.value.open[dock] } });
  }

  setTab(id: string, persist = true) {
    if (persist) {
      this.sessionTab = null;
      this.save({ ...this.value, tab: id });
    } else this.sessionTab = id;
  }

  restoreDefaults() {
    this.sessionTab = null;
    this.lastDock.clear();
    this.save(parseStudioLayout(null, PANEL_DEFAULTS));
  }

  private save(next: StudioLayoutValue) {
    this.value = next;
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not persisted, the layout still applies for this session.
    }
  }
}

export const studioLayout = new StudioLayout();
