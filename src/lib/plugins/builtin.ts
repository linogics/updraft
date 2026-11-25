import { m } from '#lib/paraglide/messages';
import { airspacePrefs } from '#lib/airspace/prefs.svelte';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';
import { thermalOverlayPrefs } from '#lib/thermals/prefs.svelte';
import type { PluginDock, PluginHost } from '#lib/studio/plugins';

/** A plugin that ships with the app. The metadata is here so a hidden one is never imported. */
export interface BuiltinPlugin {
  id: string;
  title: () => string;
  dock: PluginDock;
  hidden?: boolean;
  collapsed?: boolean;
  pinned?: boolean;
  /** Same as on a panel: turns its feature on or off when the panel is added or removed. */
  enable?: (on: boolean) => void;
  startsOff?: boolean;
  hosts?: PluginHost[];
  /** Built-in panel id this one follows in the default order. Appended when missing. */
  after?: string;
  /** Module whose default export is a studio plugin. */
  load: () => Promise<{ default: unknown }>;
}

export const BUILTIN_PLUGINS: readonly BuiltinPlugin[] = [
  {
    id: 'updraft/stats',
    title: () => m.panel_stats(),
    dock: 'right',
    after: 'thermals',
    load: () => import('./builtin/stats')
  },
  {
    id: 'updraft/xc',
    title: () => m.panel_xc(),
    dock: 'right',
    collapsed: true,
    enable: (on) => xcPrefs.setEnabled(on),
    startsOff: true,
    after: 'scene',
    load: () => import('./builtin/xc')
  },
  {
    id: 'updraft/airspace',
    title: () => m.panel_airspace(),
    dock: 'right',
    collapsed: true,
    enable: (on) => airspacePrefs.set({ show: on }),
    after: 'plugin:updraft/xc',
    load: () => import('./builtin/airspace')
  },
  {
    id: 'updraft/thermal-overlay',
    title: () => m.panel_thermal_overlay(),
    dock: 'right',
    collapsed: true,
    enable: (on) => thermalOverlayPrefs.set({ enabled: on }),
    after: 'plugin:updraft/airspace',
    load: () => import('./builtin/thermal-overlay')
  },
  {
    id: 'updraft/units',
    title: () => m.units_menu(),
    dock: 'right',
    collapsed: true,
    after: 'export',
    load: () => import('./builtin/units')
  }
];

/** A backend that ships with the app. Imported only when the user picks it. */
export interface BuiltinBackend {
  id: string;
  name: string;
  /** Module whose default export is a backend plugin. */
  load: () => Promise<{ default: unknown }>;
}

export const BUILTIN_BACKENDS: readonly BuiltinBackend[] = [
  { id: 'updraft/pocketbase', name: 'PocketBase', load: () => import('./builtin/pocketbase') }
];
