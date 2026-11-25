import type { Component } from 'svelte';
import type { StudioState } from '#lib/state/studio.svelte';
import { m } from '#lib/paraglide/messages';
import { componentPlugin } from '../componentPlugin';
import ThermalOverlayControls from './ThermalOverlayControls.svelte';

// The controls take no props, the extra studio prop is ignored.
const Controls = ThermalOverlayControls as unknown as Component<{ studio: StudioState }>;

export default componentPlugin(
  { id: 'updraft/thermal-overlay', name: m.panel_thermal_overlay(), dock: 'right' },
  Controls
);
