import type { Component } from 'svelte';
import { m } from '#lib/paraglide/messages';
import type { StudioState } from '#lib/state/studio.svelte';
import type { PluginHostEnv } from './pluginContext.svelte';

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
  /** Turns the feature of the panel on or off. Removing the panel turns it off, adding it turns it on. */
  enable?: (on: boolean) => void;
  /** The feature is off on a fresh start and after restoring the defaults. */
  startsOff?: boolean;
  load: () => Promise<PanelModule>;
  /** Cache key of the loaded module, defaults to the id. A plugin that is removed and added again from another URL gets a new one. */
  key?: string;
}

export interface PanelModule {
  default: Component<{ studio?: StudioState; host?: PluginHostEnv }>;
  /** Extra props for the component, a plugin host gets its plugin here. */
  props?: Record<string, unknown>;
}
