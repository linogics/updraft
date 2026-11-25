import { mount, unmount, type Component } from 'svelte';
import type { StudioState } from '#lib/state/studio.svelte';
import type { PluginDock, PluginHost, StudioPlugin } from '#lib/studio/plugins';
import { STUDIO_STATE_SERVICE } from '#lib/studio/studioService.svelte';

interface ComponentPluginOptions {
  id: string;
  name: string;
  dock: PluginDock;
  requires?: string[];
  hosts?: PluginHost[];
  drawExport?: StudioPlugin['drawExport'];
}

/** A bundled plugin whose panel is a plain Svelte component that takes the live studio state as `studio`. */
export function componentPlugin(
  o: ComponentPluginOptions,
  component: Component<{ studio: StudioState }>
): StudioPlugin {
  const { requires = [], ...rest } = o;
  return {
    ...rest,
    kind: 'studio',
    apiVersion: 2,
    requires: [STUDIO_STATE_SERVICE, ...requires],
    mount(el, ctx) {
      const app = mount(component, { target: el, props: { studio: ctx.use<StudioState>(STUDIO_STATE_SERVICE) } });
      return () => void unmount(app);
    }
  };
}
