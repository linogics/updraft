import type { Component } from 'svelte';
import type { StudioState } from '#lib/state/studio.svelte';
import { m } from '#lib/paraglide/messages';
import { componentPlugin } from '../componentPlugin';
import AirspaceControls from './AirspaceControls.svelte';

// The controls take no props, the extra studio prop is ignored.
const Controls = AirspaceControls as unknown as Component<{ studio: StudioState }>;

export default componentPlugin({ id: 'updraft/airspace', name: m.panel_airspace(), dock: 'right' }, Controls);
