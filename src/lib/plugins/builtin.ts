import { m } from '#lib/paraglide/messages';
import type { PluginDock } from '#lib/studio/plugins';

/** A plugin that ships with the app. The metadata is here so a hidden one is never imported. */
export interface BuiltinPlugin {
  id: string;
  title: () => string;
  dock: PluginDock;
  hidden?: boolean;
  collapsed?: boolean;
  pinned?: boolean;
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
