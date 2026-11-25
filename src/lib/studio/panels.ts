import type { Component } from 'svelte';
import { m } from '#lib/paraglide/messages';
import type { StudioState } from '#lib/state/studio.svelte';

export type Dock = 'left' | 'right' | 'bottom';

export const DOCKS: readonly Dock[] = ['left', 'right', 'bottom'];

export const DOCK_LABELS: Record<Dock, () => string> = {
  left: () => m.dock_left(),
  right: () => m.dock_right(),
  bottom: () => m.dock_bottom()
};

/** A panel that can sit in a dock. `load` is only called when the panel is shown, so hidden panels cost nothing. */
export interface PanelDef {
  id: string;
  title: () => string;
  /** Dock the panel starts in. */
  dock: Dock;
  /** Stays in its default dock, it can be hidden and reordered there but not moved to another dock. */
  pinned?: boolean;
  /** Starts hidden, the user turns it on from the Panels menu. */
  hidden?: boolean;
  /** Starts folded to its header. */
  collapsed?: boolean;
  load: () => Promise<PanelModule>;
  /** Cache key of the loaded module, defaults to the id. A plugin that is removed and added again from another URL gets a new one. */
  key?: string;
}

export interface PanelModule {
  default: Component<{ studio: StudioState }>;
  /** Extra props for the component, a plugin host gets its plugin here. */
  props?: Record<string, unknown>;
}

export const BUILTIN_PANELS: PanelDef[] = [
  {
    id: 'pilots',
    title: () => m.pilots_heading(),
    dock: 'left',
    load: () => import('#lib/components/PilotList.svelte')
  },
  {
    id: 'thermals',
    title: () => m.climbs_heading(),
    dock: 'left',
    load: () => import('#lib/components/ThermalList.svelte')
  },
  {
    id: 'track',
    title: () => m.track_menu(),
    dock: 'right',
    load: () => import('#lib/components/TrackPanel.svelte')
  },
  {
    id: 'scene',
    title: () => m.panel_scene(),
    dock: 'right',
    load: () => import('#lib/components/ScenePanel.svelte')
  },
  {
    id: 'xc',
    collapsed: true,
    title: () => m.panel_xc(),
    dock: 'right',
    load: () => import('#lib/components/XcPanel.svelte')
  },
  {
    id: 'airspace',
    collapsed: true,
    title: () => m.panel_airspace(),
    dock: 'right',
    load: () => import('#lib/components/AirspacePanel.svelte')
  },
  {
    id: 'thermal-overlay',
    collapsed: true,
    title: () => m.panel_thermal_overlay(),
    dock: 'right',
    load: () => import('#lib/components/ThermalOverlayPanel.svelte')
  },
  {
    id: 'export',
    collapsed: true,
    title: () => m.export_menu(),
    dock: 'right',
    load: () => import('#lib/components/ExportPanel.svelte')
  },
  {
    id: 'units',
    collapsed: true,
    title: () => m.units_menu(),
    dock: 'right',
    load: () => import('#lib/components/UnitsPanel.svelte')
  },
  {
    id: 'ion',
    collapsed: true,
    title: () => m.panel_ion(),
    dock: 'right',
    load: () => import('#lib/components/IonPanel.svelte')
  },
  {
    id: 'altitude',
    pinned: true,
    title: () => m.studio_tab_altitude(),
    dock: 'bottom',
    load: () => import('#lib/components/AltitudeChart.svelte')
  },
  {
    id: 'timeline',
    pinned: true,
    title: () => m.timeline_label(),
    dock: 'bottom',
    load: () => import('#lib/components/Timeline.svelte')
  }
];
