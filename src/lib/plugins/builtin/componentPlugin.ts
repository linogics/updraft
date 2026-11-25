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
  /** The internal service that holds the state, and the prop the component gets it as. Defaults to the studio. `null` means the component takes no props. */
  state?: { service: string; prop: string } | null;
}

const STUDIO = { service: STUDIO_STATE_SERVICE, prop: 'studio' };

/** A bundled plugin whose panel is a plain Svelte component that takes a live state object as a prop. */
export function componentPlugin<P extends Record<string, unknown> = { studio: StudioState }>(
  o: ComponentPluginOptions,
  component: Component<P>
): StudioPlugin {
  const { requires = [], state = STUDIO, ...rest } = o;
  return {
    ...rest,
    kind: 'studio',
    apiVersion: 2,
    requires: state ? [state.service, ...requires] : requires,
    mount(el, ctx) {
      const props = state ? { [state.prop]: ctx.use(state.service) } : {};
      const app = mount(component, { target: el, props: props as unknown as P });
      return () => void unmount(app);
    }
  };
}
