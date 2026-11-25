import type { Dock } from '#lib/studio/panels';
import { panelById, registry } from '#lib/studio/registry.svelte';
import {
  clampSize,
  forgetInLayout,
  hideInLayout,
  LAYOUT_LIMITS,
  moveInLayout,
  parseStudioLayout,
  type LayoutSize,
  type StudioLayoutValue
} from './studioLayout';

const KEY = 'studioLayout';

const options = () => ({ pinned: registry.pinned, hidden: registry.hidden, collapsed: registry.collapsed });

// Storage can throw (private mode, blocked site data). The layout then starts at its defaults.
function load(): StudioLayoutValue {
  try {
    return parseStudioLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null'), registry.defaults, options());
  } catch {
    return parseStudioLayout(null, registry.defaults, options());
  }
}

/** Studio dock layout, kept in this browser (not in the shareable scene URL). */
class StudioLayout {
  value = $state<StudioLayoutValue>(
    typeof localStorage === 'undefined' ? parseStudioLayout(null, registry.defaults, options()) : load()
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
    const from = (['left', 'right', 'bottom'] as const).find((d) => this.value.docks[d].includes(id));
    if (from && from !== dock && registry.pinned.includes(id)) return;
    this.save(moveInLayout(this.value, id, dock, index));
  }

  hide(id: string) {
    const dock = (['left', 'right', 'bottom'] as const).find((d) => this.value.docks[d].includes(id));
    if (!dock) return;
    this.lastDock.set(id, dock);
    panelById(id)?.enable?.(false);
    this.save(hideInLayout(this.value, id));
  }

  forget(id: string) {
    this.lastDock.delete(id);
    this.save(forgetInLayout(this.value, id));
  }

  show(id: string) {
    panelById(id)?.enable?.(true);
    this.move(id, this.lastDock.get(id) ?? registry.defaults[id], Infinity);
  }

  toggleCollapsed(id: string) {
    const c = this.value.collapsed;
    this.save({ ...this.value, collapsed: c.includes(id) ? c.filter((x) => x !== id) : [...c, id] });
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
    for (const p of registry.list) p.enable?.(!p.startsOff);
    this.save(parseStudioLayout(null, registry.defaults, options()));
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
