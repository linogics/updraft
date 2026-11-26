import { airspacePrefs } from '#lib/airspace/prefs.svelte';
import { m } from '#lib/paraglide/messages';
import { xcPrefs } from '#lib/state/xcPrefs.svelte';
import type { PluginDock, PluginHost } from '#lib/studio/plugins';
import { thermalOverlayPrefs } from '#lib/thermals/prefs.svelte';

import type { ConverterMeta } from './converterKind';

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
  /** Module whose default export is a studio plugin. */
  load: () => Promise<{ default: unknown }>;
}

/** Every bundled panel. The array order is the default order inside each studio dock. */
export const BUILTIN_PLUGINS: readonly BuiltinPlugin[] = [
  { id: 'updraft/pilots', title: () => m.pilots_heading(), dock: 'left', load: () => import('./builtin/pilots') },
  { id: 'updraft/climbs', title: () => m.climbs_heading(), dock: 'left', load: () => import('./builtin/climbs') },
  { id: 'updraft/stats', title: () => m.panel_stats(), dock: 'right', load: () => import('./builtin/stats') },
  { id: 'updraft/track', title: () => m.track_menu(), dock: 'right', load: () => import('./builtin/track') },
  { id: 'updraft/scene', title: () => m.panel_scene(), dock: 'right', load: () => import('./builtin/scene') },
  {
    id: 'updraft/xc',
    title: () => m.panel_xc(),
    dock: 'right',
    collapsed: true,
    enable: (on) => xcPrefs.setEnabled(on),
    startsOff: true,
    load: () => import('./builtin/xc')
  },
  {
    id: 'updraft/airspace',
    title: () => m.panel_airspace(),
    dock: 'right',
    collapsed: true,
    enable: (on) => airspacePrefs.set({ show: on }),
    hosts: ['studio', 'plan'],
    load: () => import('./builtin/airspace')
  },
  {
    id: 'updraft/thermal-overlay',
    title: () => m.panel_thermal_overlay(),
    dock: 'right',
    collapsed: true,
    enable: (on) => thermalOverlayPrefs.set({ enabled: on }),
    hosts: ['studio', 'plan'],
    load: () => import('./builtin/thermal-overlay')
  },
  {
    id: 'updraft/plan-xc',
    title: () => m.plan_xc_score(),
    dock: 'right',
    collapsed: true,
    hosts: ['plan'],
    load: () => import('./builtin/plan-xc')
  },
  {
    id: 'updraft/export',
    title: () => m.export_menu(),
    dock: 'right',
    collapsed: true,
    load: () => import('./builtin/export')
  },
  {
    id: 'updraft/units',
    title: () => m.units_menu(),
    dock: 'right',
    collapsed: true,
    load: () => import('./builtin/units')
  },
  {
    id: 'updraft/ion',
    title: () => m.panel_ion(),
    dock: 'right',
    collapsed: true,
    load: () => import('./builtin/ion')
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

/** A bundled track format. The metadata is here so the module is only imported when a file needs it. */
export interface BuiltinConverter extends ConverterMeta {
  id: string;
  /** Module whose default export is a converter plugin. */
  load: () => Promise<{ default: unknown }>;
}

/** Every bundled format. The array order decides which converter wins for an extension and the list order. */
export const BUILTIN_CONVERTERS: readonly BuiltinConverter[] = [
  {
    id: 'updraft/igc',
    label: 'IGC',
    extensions: ['igc'],
    canRead: true,
    canWrite: true,
    mime: 'application/octet-stream',
    load: () => import('./builtin/formats/igc')
  },
  {
    id: 'updraft/gpx',
    label: 'GPX',
    extensions: ['gpx'],
    canRead: true,
    canWrite: true,
    mime: 'application/gpx+xml',
    load: () => import('./builtin/formats/gpx')
  },
  {
    id: 'updraft/kml',
    label: 'KML',
    extensions: ['kml'],
    canRead: true,
    canWrite: true,
    mime: 'application/vnd.google-earth.kml+xml',
    load: () => import('./builtin/formats/kml')
  },
  {
    id: 'updraft/geojson',
    label: 'GeoJSON',
    extensions: ['geojson', 'json'],
    canRead: true,
    canWrite: true,
    mime: 'application/geo+json',
    load: () => import('./builtin/formats/geojson')
  },
  {
    id: 'updraft/trk',
    label: 'TRK',
    extensions: ['trk'],
    canRead: true,
    canWrite: false,
    load: () => import('./builtin/formats/trk')
  },
  {
    id: 'updraft/fit',
    label: 'FIT',
    extensions: ['fit'],
    canRead: true,
    canWrite: false,
    load: () => import('./builtin/formats/fit')
  }
];
