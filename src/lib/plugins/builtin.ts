import { m } from '#lib/paraglide/messages';
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
  /** Panel id this one follows in the default order, null puts it first. Appended when missing. */
  after?: string | null;
  /** Module whose default export is a studio plugin. */
  load: () => Promise<{ default: unknown }>;
}

export const BUILTIN_PLUGINS: readonly BuiltinPlugin[] = [
  {
    id: 'updraft/pilots',
    title: () => m.pilots_heading(),
    dock: 'left',
    after: null,
    load: () => import('./builtin/pilots')
  },
  {
    id: 'updraft/climbs',
    title: () => m.climbs_heading(),
    dock: 'left',
    after: 'plugin:updraft/pilots',
    load: () => import('./builtin/climbs')
  },
  {
    id: 'updraft/stats',
    title: () => m.panel_stats(),
    dock: 'right',
    after: 'plugin:updraft/climbs',
    load: () => import('./builtin/stats')
  },
  {
    id: 'updraft/units',
    title: () => m.units_menu(),
    dock: 'right',
    collapsed: true,
    after: 'export',
    load: () => import('./builtin/units')
  },
  {
    id: 'updraft/altitude',
    title: () => m.studio_tab_altitude(),
    dock: 'bottom',
    pinned: true,
    load: () => import('./builtin/altitude')
  },
  {
    id: 'updraft/timeline',
    title: () => m.timeline_label(),
    dock: 'bottom',
    pinned: true,
    load: () => import('./builtin/timeline')
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
